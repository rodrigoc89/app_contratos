import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

/**
 * Every path `provision.sh` touches is overridable via environment variable
 * (production defaults live in the script itself). These specs never touch
 * `/opt/contratos`, `/etc/fstab`, or a real system user — everything is
 * redirected into a scratch temp directory, so the whole idempotent-guard
 * plan is provable with no root and no VPS (design.md D8).
 */
const SCRIPT = join(import.meta.dirname, "provision.sh");
const ROOT_PACKAGE_JSON = join(import.meta.dirname, "..", "package.json");

// The assertions below interpolate real filesystem paths, so they compare
// literal substrings rather than building regexes out of them: a `TMPDIR`
// holding a regex metacharacter would loosen the match instead of failing.

/**
 * `provision_node` decides from what `$PATH` resolves, so both "bare host"
 * and "already provisioned" are simulated with a scratch bin directory
 * instead of whatever this machine happens to have installed. The first
 * real run on the VPS died at `npx: command not found` precisely because
 * this harness had only ever inherited a developer PATH that already had
 * Node — a bare host was never represented.
 *
 * Only the binaries a dry run touches are linked in (`bash` for the shebang,
 * `id` for the user guard, `grep` for the git-exclude guard, `git` for the
 * safe.directory guard — pointed at a scratch system config through
 * `GIT_CONFIG_SYSTEM`, never at this machine's /etc/gitconfig; `cmp` for
 * the unit-file guard); `node`/`pnpm` fakes that print the given version
 * are added on request.
 *
 * `systemctl` is a fake when `host.apiUnitEnabled` or
 * `host.backupTimerEnabled` is given: it answers `is-enabled`/`is-active`
 * per unit (unnamed units read as disabled) and exits 99 for anything
 * else, so a dry run that reaches `daemon-reload`/`enable` fails the spec
 * instead of passing silently.
 * `sudo` + `psql` are fakes when `host.databaseProvisioned` is given, on
 * the same terms: `sudo` drops its `-n -u postgres` and execs the command
 * on this PATH, `psql` answers the `SELECT 1 …` existence probes it reads
 * on stdin (`1` = present, nothing = absent) and exits 99 on any DDL.
 */
async function makeToolchainBin(
  scratch: string,
  present: { node?: string; pnpm?: string } = {},
  host: {
    apiUnitEnabled?: boolean;
    backupTimerEnabled?: boolean;
    databaseProvisioned?: boolean;
  } = {},
): Promise<string> {
  const binDir = join(scratch, "bin");
  await mkdir(binDir);
  await symlink("/bin/bash", join(binDir, "bash"));
  await symlink("/usr/bin/id", join(binDir, "id"));
  await symlink("/usr/bin/grep", join(binDir, "grep"));
  await symlink("/usr/bin/git", join(binDir, "git"));
  await symlink("/usr/bin/cmp", join(binDir, "cmp"));
  for (const [name, version] of Object.entries(present)) {
    await writeFile(join(binDir, name), `#!/bin/bash\nprintf '%s\\n' '${version}'\n`, {
      mode: 0o755,
    });
  }
  if (host.apiUnitEnabled !== undefined || host.backupTimerEnabled !== undefined) {
    // Builtins only: this PATH has no coreutils. The unit name is the last
    // argument (`systemctl is-enabled --quiet <unit>`).
    await writeFile(
      join(binDir, "systemctl"),
      [
        "#!/bin/bash",
        'unit="${*: -1}"',
        'case "$1:$unit" in',
        `  is-enabled:contratos-api.service) exit ${host.apiUnitEnabled ? 0 : 1} ;;`,
        `  is-enabled:contratos-backup.timer | is-active:contratos-backup.timer) exit ${host.backupTimerEnabled ? 0 : 1} ;;`,
        "  is-enabled:* | is-active:*) exit 1 ;;",
        `  *) printf 'systemctl %s: a dry run must never reach this\\n' "$*" >&2; exit 99 ;;`,
        "esac",
        "",
      ].join("\n"),
      { mode: 0o755 },
    );
  }
  if (host.databaseProvisioned !== undefined) {
    await writeFile(
      join(binDir, "sudo"),
      [
        "#!/bin/bash",
        'while [ "$#" -gt 0 ]; do',
        '  case "$1" in',
        "    -n) shift ;;",
        "    -u) shift 2 ;;",
        "    --) shift; break ;;",
        "    *) break ;;",
        "  esac",
        "done",
        'exec "$@"',
        "",
      ].join("\n"),
      { mode: 0o755 },
    );
    await writeFile(
      join(binDir, "psql"),
      [
        "#!/bin/bash",
        'sql="$(</dev/stdin)"',
        'case "$sql" in',
        `  SELECT*) ${host.databaseProvisioned ? "printf '1\\n'" : ":"} ;;`,
        `  *) printf 'psql: a dry run must never reach DDL: %s\\n' "$sql" >&2; exit 99 ;;`,
        "esac",
        "",
      ].join("\n"),
      { mode: 0o755 },
    );
  }
  return binDir;
}

const API_UNIT_FIXTURE = "[Unit]\nDescription=fake contratos-api\n[Service]\nExecStart=/bin/true\n";
const BACKUP_SERVICE_FIXTURE =
  "[Unit]\nDescription=fake contratos-backup\n[Service]\nType=oneshot\nExecStart=/bin/true\n";
const BACKUP_TIMER_FIXTURE =
  "[Unit]\nDescription=fake timer\n[Timer]\nOnCalendar=daily\n[Install]\nWantedBy=timers.target\n";

async function writeBackupUnits(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "contratos-backup.service"), BACKUP_SERVICE_FIXTURE, "utf-8");
  await writeFile(join(dir, "contratos-backup.timer"), BACKUP_TIMER_FIXTURE, "utf-8");
}

describe("provision.sh --dry-run", () => {
  let scratch: string;

  beforeEach(async () => {
    scratch = await mkdtemp(join(tmpdir(), "provision-spec-"));
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it("plans to create every idempotent-guarded resource on a bare host", async () => {
    const appDir = join(scratch, "opt-contratos");
    const documentStoreDir = join(appDir, "var", "documentos");
    const swapFile = join(scratch, "swapfile");
    const fstabFile = join(scratch, "fstab");
    const excludeFile = join(appDir, ".git", "info", "exclude");
    const etcDir = join(scratch, "etc-contratos");
    const dbPasswordFile = join(etcDir, "db.password");
    const backupWorkDir = join(scratch, "var-backups-contratos-offsite");
    await writeFile(fstabFile, "", "utf-8");
    const binDir = await makeToolchainBin(scratch, {}, { databaseProvisioned: false });

    const { stdout } = await execFileAsync(SCRIPT, ["--dry-run"], {
      env: {
        ...process.env,
        PATH: binDir,
        SERVICE_USER: "a-user-that-should-never-exist-anywhere",
        APP_DIR: appDir,
        DOCUMENT_STORE_DIR: documentStoreDir,
        SWAP_FILE: swapFile,
        SWAP_SIZE_MB: "64",
        FSTAB_FILE: fstabFile,
        GIT_EXCLUDE_FILE: excludeFile,
        GIT_CONFIG_SYSTEM: join(scratch, "gitconfig-that-does-not-exist"),
        ETC_CONTRATOS_DIR: etcDir,
        DB_PASSWORD_FILE: dbPasswordFile,
        BACKUP_WORK_DIR: backupWorkDir,
        SYSTEMD_UNIT_DIR: join(scratch, "etc-systemd-system"),
      },
    });

    // The Chromium step below runs `npx`, which only exists once Node does:
    // on the first real host this was `npx: command not found`, and the
    // whole run aborted there. Order is the assertion, not just presence.
    const nodePlan = "[plan] would install Node.js 24 (NodeSource) and pnpm 11.11.0";
    const chromiumPlan = "[plan] would run: npx --yes puppeteer@";
    expect(stdout).toContain(nodePlan);
    expect(stdout).toContain(chromiumPlan);
    expect(stdout.indexOf(nodePlan)).toBeLessThan(stdout.indexOf(chromiumPlan));
    // Nothing created the role/database DATABASE_URL points at, so
    // deploy.sh's `prisma migrate deploy` failed on the fresh host. Both are
    // guarded separately (like swapfile + fstab), right after PostgreSQL
    // itself is installed and before anything else.
    const postgresPlan = "[plan] would add the PGDG apt repository and install postgresql-17";
    const rolePlan = `[plan] would create postgres role 'contratos' (LOGIN) with a generated password written only to '${dbPasswordFile}' (root:root, mode 600)`;
    const databasePlan = "[plan] would create postgres database 'contratos' owned by 'contratos'";
    expect(stdout).toContain(rolePlan);
    expect(stdout).toContain(databasePlan);
    expect(stdout.indexOf(postgresPlan)).toBeLessThan(stdout.indexOf(rolePlan));
    expect(stdout.indexOf(rolePlan)).toBeLessThan(stdout.indexOf(databasePlan));
    expect(stdout.indexOf(databasePlan)).toBeLessThan(stdout.indexOf(nodePlan));
    // A dry run plans a password; it never generates or writes one.
    await expect(access(dbPasswordFile)).rejects.toMatchObject({ code: "ENOENT" });
    expect(stdout).toContain(
      "[plan] would create system user 'a-user-that-should-never-exist-anywhere'",
    );
    expect(stdout).toContain(`[plan] would create directory '${appDir}'`);
    expect(stdout).toContain(`[plan] would create directory '${documentStoreDir}'`);
    // contratos-backup.service lists its keyring and its work directory in
    // ReadWritePaths; with ProtectSystem=strict systemd bind-mounts those
    // BEFORE ExecStart, so backup.sh's own `mkdir -p` never gets to run and
    // a missing path is status=226/NAMESPACE, same as gap #7. Root-only:
    // the work directory stages a plaintext pg_dump before encryption.
    expect(stdout).toContain(`[plan] would create directory '${etcDir}' (owner root:root, mode 700)`);
    expect(stdout).toContain(
      `[plan] would create directory '${join(etcDir, "gnupg")}' (owner root:root, mode 700)`,
    );
    expect(stdout).toContain(
      `[plan] would create directory '${backupWorkDir}' (owner root:root, mode 700)`,
    );
    expect(stdout).toContain(
      `[skip] '${appDir}/deploy/contratos-backup.service' or '${appDir}/deploy/contratos-backup.timer' not found — clone the repository into '${appDir}' and re-run provision.sh to install and enable contratos-backup.timer`,
    );
    // The size comes from SWAP_SIZE_MB above, so this asserts the override is
    // honoured as well as the guard — the production default is 2048.
    expect(stdout).toContain(`[plan] would create a 64MB swapfile at '${swapFile}'`);
    expect(stdout).toContain(
      `[plan] would append '${swapFile} none swap sw 0 0' to '${fstabFile}'`,
    );
    expect(stdout).toContain(`[plan] would append '.cache/' to '${excludeFile}'`);
    // `useradd --create-home` copies /etc/skel into $APP_DIR, which is also
    // the checkout: three untracked dotfiles that trip deploy.sh's
    // dirty-worktree guard on the very first deploy. Seen on the real host.
    for (const skeletonFile of [".bash_logout", ".bashrc", ".profile"]) {
      expect(stdout).toContain(`[plan] would append '${skeletonFile}' to '${excludeFile}'`);
    }
    // The checkout is also the service user's HOME, so the first deploy's
    // `pnpm install` (as contratos) left `.config/` and `.local/` behind and
    // the second `deploy.sh` was refused over a "dirty" worktree. Seen on
    // the real host. Every XDG/config dir a HOME accumulates is excluded.
    for (const xdgDir of [".config/", ".local/", ".npm/", ".pnpm-store/"]) {
      expect(stdout).toContain(`[plan] would append '${xdgDir}' to '${excludeFile}'`);
    }
    // deploy.sh runs as root against a checkout owned by `contratos`; git
    // refuses that ("dubious ownership") and the repository guard reports
    // "not a git checkout". Seen on the real host.
    expect(stdout).toContain(
      `[plan] would run: git config --system --add safe.directory '${appDir}'`,
    );
    // No checkout yet, so no unit file to install: say so, and say what to
    // do about it — provision.sh is idempotent precisely so it can be re-run
    // after the clone.
    expect(stdout).toContain(
      `[skip] '${appDir}/deploy/contratos-api.service' not found — clone the repository into '${appDir}' and re-run provision.sh to install contratos-api.service`,
    );
  });

  it("skips every idempotent-guarded resource that is already provisioned", async () => {
    const currentUser = userInfo().username;
    const appDir = join(scratch, "opt-contratos");
    const documentStoreDir = join(appDir, "var", "documentos");
    const swapFile = join(scratch, "swapfile");
    const fstabFile = join(scratch, "fstab");
    const excludeFile = join(appDir, ".git", "info", "exclude");

    await mkdir(documentStoreDir, { recursive: true });
    await writeFile(swapFile, "", "utf-8");
    await writeFile(fstabFile, `${swapFile} none swap sw 0 0\n`, "utf-8");
    await mkdir(join(appDir, ".git", "info"), { recursive: true });
    await writeFile(
      excludeFile,
      ".cache/\n.bash_logout\n.bashrc\n.profile\n.config/\n.local/\n.npm/\n.pnpm-store/\n",
      "utf-8",
    );
    const gitSystemConfig = join(scratch, "gitconfig");
    await writeFile(gitSystemConfig, `[safe]\n\tdirectory = ${appDir}\n`, "utf-8");
    const unitSource = join(appDir, "deploy", "contratos-api.service");
    const unitDir = join(scratch, "etc-systemd-system");
    const unitTarget = join(unitDir, "contratos-api.service");
    const etcDir = join(scratch, "etc-contratos");
    const backupWorkDir = join(scratch, "var-backups-contratos-offsite");
    await writeBackupUnits(join(appDir, "deploy"));
    await writeBackupUnits(unitDir);
    await writeFile(unitSource, API_UNIT_FIXTURE, "utf-8");
    await writeFile(unitTarget, API_UNIT_FIXTURE, "utf-8");
    await mkdir(join(etcDir, "gnupg"), { recursive: true });
    await mkdir(backupWorkDir, { recursive: true });
    const binDir = await makeToolchainBin(
      scratch,
      { node: "v24.1.0", pnpm: "11.11.0" },
      { apiUnitEnabled: true, backupTimerEnabled: true, databaseProvisioned: true },
    );

    const { stdout } = await execFileAsync(SCRIPT, ["--dry-run"], {
      env: {
        ...process.env,
        PATH: binDir,
        SERVICE_USER: currentUser,
        APP_DIR: appDir,
        DOCUMENT_STORE_DIR: documentStoreDir,
        SWAP_FILE: swapFile,
        FSTAB_FILE: fstabFile,
        GIT_EXCLUDE_FILE: excludeFile,
        GIT_CONFIG_SYSTEM: gitSystemConfig,
        ETC_CONTRATOS_DIR: etcDir,
        BACKUP_WORK_DIR: backupWorkDir,
        SYSTEMD_UNIT_DIR: unitDir,
      },
    });

    expect(stdout).toContain("[skip] node v24.1.0 (>= 24) and pnpm 11.11.0 already installed");
    expect(stdout).toContain(`[skip] user '${currentUser}' already exists`);
    expect(stdout).toContain(`[skip] directory '${appDir}' already exists`);
    expect(stdout).toContain(`[skip] directory '${documentStoreDir}' already exists`);
    expect(stdout).toContain(`[skip] directory '${etcDir}' already exists`);
    expect(stdout).toContain(`[skip] directory '${join(etcDir, "gnupg")}' already exists`);
    expect(stdout).toContain(`[skip] directory '${backupWorkDir}' already exists`);
    expect(stdout).toContain(
      `[skip] contratos-backup.service and contratos-backup.timer already installed in '${unitDir}' (identical), contratos-backup.timer enabled and active`,
    );
    expect(stdout).toContain(`[skip] swapfile '${swapFile}' already exists`);
    expect(stdout).toContain(
      `[skip] fstab entry for '${swapFile}' already present in '${fstabFile}'`,
    );
    // Guarded per line, not per file: a host provisioned before the skeleton
    // or XDG entries existed has `.cache/` only and must still gain the rest.
    for (const entry of [
      ".cache/",
      ".bash_logout",
      ".bashrc",
      ".profile",
      ".config/",
      ".local/",
      ".npm/",
      ".pnpm-store/",
    ]) {
      expect(stdout).toContain(`[skip] '${entry}' already present in '${excludeFile}'`);
    }
    expect(stdout).toContain(
      `[skip] '${appDir}' already listed in git's system-wide safe.directory`,
    );
    expect(stdout).toContain(
      `[skip] contratos-api.service already installed at '${unitTarget}' (identical) and enabled`,
    );
    // An existing role is never touched: provision.sh does not know its
    // password and must never rotate it out from under a working
    // DATABASE_URL.
    expect(stdout).toContain(
      "[skip] postgres role 'contratos' already exists (password left untouched)",
    );
    expect(stdout).toContain("[skip] postgres database 'contratos' already exists");
  });

  it("refuses a DB_ROLE or DB_NAME that is not a plain SQL identifier", async () => {
    // Both are interpolated into SQL fed to psql as the postgres superuser;
    // the guard keeps that to bare identifiers instead of trusting quoting.
    const binDir = await makeToolchainBin(scratch, {}, { databaseProvisioned: false });

    await expect(
      execFileAsync(SCRIPT, ["--dry-run"], {
        env: {
          ...process.env,
          PATH: binDir,
          APP_DIR: join(scratch, "opt-contratos"),
          GIT_CONFIG_SYSTEM: join(scratch, "gitconfig-that-does-not-exist"),
          DB_ROLE: "contratos'; DROP ROLE postgres; --",
        },
      }),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("DB_ROLE"),
    });
  });

  it("installs git, which the safe.directory step and deploy.sh both need", async () => {
    // A bare Ubuntu server image ships no git; the first host only had it
    // because the operator installed it by hand to clone the repository.
    const { stdout } = await execFileAsync(SCRIPT, ["--dry-run"], {
      env: { ...process.env, APP_DIR: join(scratch, "opt-contratos") },
    });

    const aptPlan = stdout.split("\n").find((line) => line.includes("apt-get install -y"));

    expect(aptPlan?.split(" ")).toContain("git");
  });

  it("installs and enables contratos-api.service from the checkout, after every host step", async () => {
    // Nothing installed the unit before this: deploy.sh's start step assumed
    // it existed and the README only ever documented copying the backup
    // units. The unit steps go after everything else because they need the
    // checkout, which every other step is indifferent to.
    const appDir = join(scratch, "opt-contratos");
    const unitSource = join(appDir, "deploy", "contratos-api.service");
    const unitTarget = join(scratch, "etc-systemd-system", "contratos-api.service");
    await mkdir(join(appDir, "deploy"), { recursive: true });
    await writeFile(unitSource, API_UNIT_FIXTURE, "utf-8");
    const binDir = await makeToolchainBin(scratch, {}, { apiUnitEnabled: false });

    const { stdout } = await execFileAsync(SCRIPT, ["--dry-run"], {
      env: {
        ...process.env,
        PATH: binDir,
        APP_DIR: appDir,
        GIT_CONFIG_SYSTEM: join(scratch, "gitconfig-that-does-not-exist"),
        API_UNIT_TARGET: unitTarget,
      },
    });

    const unitPlan = `[plan] would install '${unitSource}' as '${unitTarget}' (mode 644), run systemctl daemon-reload, and enable contratos-api.service — never start it`;
    expect(stdout).toContain(unitPlan);
    const safeDirectoryPlan = `[plan] would run: git config --system --add safe.directory '${appDir}'`;
    expect(stdout.indexOf(safeDirectoryPlan)).toBeLessThan(stdout.indexOf(unitPlan));
    expect(stdout.indexOf(unitPlan)).toBeLessThan(stdout.indexOf("== done =="));
  });

  it("installs the backup units from the checkout and enables the timer, re-enabling a disabled one", async () => {
    // The README only ever documented a manual `cp` + `daemon-reload` +
    // `enable --now` for these two; the real host had neither installed.
    // Enabling before backup.env exists is deliberate: backup.sh exits 1
    // naming the missing file, so a premature nightly run fails loudly in
    // the journal rather than the schedule silently never existing.
    const appDir = join(scratch, "opt-contratos");
    const unitDir = join(scratch, "etc-systemd-system");
    await writeBackupUnits(join(appDir, "deploy"));
    const backupPlan = `[plan] would install '${appDir}/deploy/contratos-backup.service' and '${appDir}/deploy/contratos-backup.timer' into '${unitDir}' (mode 644), run systemctl daemon-reload, and enable --now contratos-backup.timer`;
    const env = {
      ...process.env,
      APP_DIR: appDir,
      GIT_CONFIG_SYSTEM: join(scratch, "gitconfig-that-does-not-exist"),
      SYSTEMD_UNIT_DIR: unitDir,
    };

    const bareBin = await makeToolchainBin(scratch, {}, { backupTimerEnabled: false });
    const fresh = await execFileAsync(SCRIPT, ["--dry-run"], { env: { ...env, PATH: bareBin } });
    expect(fresh.stdout).toContain(backupPlan);
    expect(fresh.stdout.indexOf(backupPlan)).toBeLessThan(fresh.stdout.indexOf("== done =="));

    // Identical files, timer disabled: still a plan, not a skip.
    await writeBackupUnits(unitDir);
    await rm(bareBin, { recursive: true, force: true });
    const disabledBin = await makeToolchainBin(scratch, {}, { backupTimerEnabled: false });
    const disabled = await execFileAsync(SCRIPT, ["--dry-run"], {
      env: { ...env, PATH: disabledBin },
    });
    expect(disabled.stdout).toContain(backupPlan);
  });

  it("reinstalls a drifted unit file and re-enables an identical one that is disabled", async () => {
    // Two half-provisioned states the byte-identical + enabled guard must
    // not read as "done": the checkout's unit changed since it was copied,
    // and an identical copy that somebody disabled.
    const appDir = join(scratch, "opt-contratos");
    const unitSource = join(appDir, "deploy", "contratos-api.service");
    const unitTarget = join(scratch, "etc-systemd-system", "contratos-api.service");
    await mkdir(join(appDir, "deploy"), { recursive: true });
    await mkdir(join(scratch, "etc-systemd-system"), { recursive: true });
    await writeFile(unitSource, API_UNIT_FIXTURE, "utf-8");
    const unitPlan = `[plan] would install '${unitSource}' as '${unitTarget}' (mode 644), run systemctl daemon-reload, and enable contratos-api.service — never start it`;
    const env = {
      ...process.env,
      APP_DIR: appDir,
      GIT_CONFIG_SYSTEM: join(scratch, "gitconfig-that-does-not-exist"),
      API_UNIT_TARGET: unitTarget,
    };

    await writeFile(unitTarget, `${API_UNIT_FIXTURE}# stale\n`, "utf-8");
    const enabledBin = await makeToolchainBin(scratch, {}, { apiUnitEnabled: true });
    const drifted = await execFileAsync(SCRIPT, ["--dry-run"], { env: { ...env, PATH: enabledBin } });
    expect(drifted.stdout).toContain(unitPlan);

    await writeFile(unitTarget, API_UNIT_FIXTURE, "utf-8");
    await rm(enabledBin, { recursive: true, force: true });
    const disabledBin = await makeToolchainBin(scratch, {}, { apiUnitEnabled: false });
    const disabled = await execFileAsync(SCRIPT, ["--dry-run"], { env: { ...env, PATH: disabledBin } });
    expect(disabled.stdout).toContain(unitPlan);
  });

  it("reinstalls the toolchain when the Node on PATH is older than the pinned major", async () => {
    // Ubuntu's own `nodejs` package (12.x on jammy) satisfies `command -v
    // node` and nothing else — the guard has to compare the major, not
    // merely notice that a binary exists.
    const binDir = await makeToolchainBin(scratch, { node: "v18.19.0", pnpm: "11.11.0" });

    const { stdout } = await execFileAsync(SCRIPT, ["--dry-run"], {
      env: { ...process.env, PATH: binDir, APP_DIR: join(scratch, "opt-contratos") },
    });

    expect(stdout).toContain("[plan] would install Node.js 24 (NodeSource) and pnpm 11.11.0");
  });

  it("defaults to the pnpm version package.json pins and a Node major within engines.node", async () => {
    // `deploy.sh` runs `pnpm install --frozen-lockfile` as `contratos`; a
    // pnpm other than `packageManager`'s refuses that lockfile. Reading the
    // manifest here means bumping it without bumping the script goes red.
    const manifest = JSON.parse(await readFile(ROOT_PACKAGE_JSON, "utf-8")) as {
      packageManager: string;
      engines: { node: string };
    };
    const pinnedPnpm = manifest.packageManager.replace(/^pnpm@/, "");
    const nodeFloor = Number(/>=\s*(\d+)/.exec(manifest.engines.node)?.[1]);
    const binDir = await makeToolchainBin(scratch);

    const { stdout } = await execFileAsync(SCRIPT, ["--dry-run"], {
      env: { ...process.env, PATH: binDir, APP_DIR: join(scratch, "opt-contratos") },
    });

    const nodePlan = stdout
      .split("\n")
      .find((line) => line.startsWith("[plan] would install Node.js"));
    const match = /^\[plan\] would install Node\.js (\d+) \(NodeSource\) and pnpm (\S+)$/.exec(
      nodePlan ?? "",
    );
    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBeGreaterThanOrEqual(nodeFloor);
    expect(match?.[2]).toBe(pinnedPnpm);
  });

  it("never requires root for a dry run", async () => {
    // The whole point of --dry-run is that CI (and any non-root operator)
    // can preview the plan; only the real, mutating run needs root.
    expect(process.getuid?.()).not.toBe(0);

    const { stdout } = await execFileAsync(SCRIPT, ["--dry-run"], {
      env: { ...process.env, APP_DIR: join(scratch, "opt-contratos") },
    });

    expect(stdout).toContain("[plan]");
  });

  it("installs fontconfig explicitly rather than relying on Chromium pulling it in", async () => {
    // `provision_fonts_cache` runs `fc-cache`, which lives in the `fontconfig`
    // package. Without this, the step works only because `--install-deps`
    // happens to pull `libpango-1.0-0`, which depends on fontconfig — an
    // undeclared transitive dependency on the one list D1 calls unstable.
    const { stdout } = await execFileAsync(SCRIPT, ["--dry-run"], {
      env: { ...process.env, APP_DIR: join(scratch, "opt-contratos") },
    });

    const planDeApt = stdout
      .split("\n")
      .find((linea) => linea.includes("apt-get install -y"));

    expect(planDeApt).toContain("fontconfig");
  });

  it("installs unzip so Puppeteer's postinstall can extract Chrome for Testing", async () => {
    // On the first real host, `npx puppeteer browsers install chrome
    // --install-deps` exited 1 with no output: puppeteer's postinstall runs
    // before the CLI command and, on a fresh Ubuntu, fails at extraction
    // ("no zip archiver is available. Install `unzip`"). npm does not install
    // @puppeteer/browsers' optional `yauzl` fallback under npx, so only a
    // system `unzip` can make that step work — pnpm's lockfile pins yauzl,
    // which is why deploy.sh and CI never showed this.
    const { stdout } = await execFileAsync(SCRIPT, ["--dry-run"], {
      env: { ...process.env, APP_DIR: join(scratch, "opt-contratos") },
    });

    const aptPlan = stdout.split("\n").find((line) => line.includes("apt-get install -y"));

    expect(aptPlan).toContain("unzip");
  });

  it("installs poppler-utils so the render verdict's pdffonts/pdftotext layers can run", async () => {
    // On the fresh host `pnpm --filter @contratos/api verify:render` came
    // back RECHAZADO with both PDF layers reporting a missing tool, and
    // APROBADO right after `apt-get install poppler-utils`. The README calls
    // those tools opportunistic; the post-VPS checklist requires the verdict
    // to pass, so the host has to ship them.
    const { stdout } = await execFileAsync(SCRIPT, ["--dry-run"], {
      env: { ...process.env, APP_DIR: join(scratch, "opt-contratos") },
    });

    const aptPlan = stdout.split("\n").find((line) => line.includes("apt-get install -y"));

    expect(aptPlan?.split(" ")).toContain("poppler-utils");
  });

  it("installs rclone and age, which backup.sh needs to push and encrypt offsite", async () => {
    // Both were absent on the real host and had to be apt-installed by hand
    // (age 1.0.0, rclone 1.53.3 from jammy's universe). backup.sh resolves
    // them at runtime and falls back to gpg for encryption, but nothing
    // falls back for the push — a scheduled backup with no rclone fails
    // every night with the journal as its only witness.
    const { stdout } = await execFileAsync(SCRIPT, ["--dry-run"], {
      env: { ...process.env, APP_DIR: join(scratch, "opt-contratos") },
    });

    const aptPlan = stdout.split("\n").find((line) => line.includes("apt-get install -y"));

    expect(aptPlan?.split(" ")).toContain("rclone");
    expect(aptPlan?.split(" ")).toContain("age");
  });

  it("skips Puppeteer's postinstall download in the root Chromium step", async () => {
    // The explicit `browsers install chrome` is the download `--install-deps`
    // resolves libraries against; letting the postinstall fetch the same
    // ~150 MB first, into the same scratch cache, is pure waste on every
    // (re-)provision.
    const { stdout } = await execFileAsync(SCRIPT, ["--dry-run"], {
      env: { ...process.env, APP_DIR: join(scratch, "opt-contratos") },
    });

    const chromiumPlan = stdout
      .split("\n")
      .find((line) => line.includes("browsers install chrome --install-deps"));

    expect(chromiumPlan).toContain("PUPPETEER_SKIP_DOWNLOAD=1");
  });

  it("runs the root Chromium step from a scratch directory, never inside the checkout", async () => {
    // Gap #13, seen on the real host: `cd /opt/contratos && bash
    // deploy/provision.sh` — exactly what "clone, then re-run provision"
    // implies — died with `sh: 1: puppeteer: not found` (exit 127). npx
    // inside a Node project resolves the bin against the enclosing project
    // (a pnpm workspace with no root `puppeteer` bin) instead of the package
    // it just fetched; the same command from `mktemp -d` works. Earlier runs
    // passed only because they happened to start from /root.
    const { stdout } = await execFileAsync(SCRIPT, ["--dry-run"], {
      env: { ...process.env, APP_DIR: join(scratch, "opt-contratos") },
    });

    const chromiumPlan = stdout
      .split("\n")
      .find((line) => line.includes("browsers install chrome --install-deps"));

    expect(chromiumPlan).toContain(
      "run from a scratch directory outside the checkout, since npx resolves bins against an enclosing Node project",
    );
  });

  it("does not accept a commented-out fstab line as an existing swap entry", async () => {
    // A half-finished provisioning run leaves exactly this behind. Read as
    // "already present", the swapfile never survives a reboot — and nothing
    // reports an error, so the host looks provisioned when it is not.
    const swapFile = join(scratch, "swapfile");
    const fstabFile = join(scratch, "fstab");
    await writeFile(fstabFile, `# ${swapFile} none swap sw 0 0\n`, "utf-8");

    const { stdout } = await execFileAsync(SCRIPT, ["--dry-run"], {
      env: {
        ...process.env,
        APP_DIR: join(scratch, "opt-contratos"),
        SWAP_FILE: swapFile,
        FSTAB_FILE: fstabFile,
      },
    });

    expect(stdout).toContain(
      `[plan] would append '${swapFile} none swap sw 0 0' to '${fstabFile}'`,
    );
  });

  it("reads the last fstab line even when the file has no trailing newline", async () => {
    const swapFile = join(scratch, "swapfile");
    const fstabFile = join(scratch, "fstab");
    await writeFile(fstabFile, `${swapFile} none swap sw 0 0`, "utf-8");

    const { stdout } = await execFileAsync(SCRIPT, ["--dry-run"], {
      env: {
        ...process.env,
        APP_DIR: join(scratch, "opt-contratos"),
        SWAP_FILE: swapFile,
        FSTAB_FILE: fstabFile,
      },
    });

    expect(stdout).toContain(
      `[skip] fstab entry for '${swapFile}' already present in '${fstabFile}'`,
    );
  });

  it("refuses a real, mutating run when it is not root", async () => {
    // The guard that keeps a non-root operator from half-provisioning a host.
    // Safe to exercise for real: it exits before the first apt-get call.
    expect(process.getuid?.()).not.toBe(0);

    await expect(
      execFileAsync(SCRIPT, [], {
        env: { ...process.env, APP_DIR: join(scratch, "opt-contratos") },
      }),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("must run as root"),
    });
  });

  it("rejects an unrecognized flag instead of silently proceeding", async () => {
    await expect(execFileAsync(SCRIPT, ["--not-a-real-flag"])).rejects.toMatchObject({
      code: 1,
    });
  });
});
