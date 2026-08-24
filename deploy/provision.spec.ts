import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
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
 * Only the three binaries a dry run touches are linked in (`bash` for the
 * shebang, `id` for the user guard, `grep` for the git-exclude guard);
 * `node`/`pnpm` fakes that print the given version are added on request.
 */
async function makeToolchainBin(
  scratch: string,
  present: { node?: string; pnpm?: string } = {},
): Promise<string> {
  const binDir = join(scratch, "bin");
  await mkdir(binDir);
  await symlink("/bin/bash", join(binDir, "bash"));
  await symlink("/usr/bin/id", join(binDir, "id"));
  await symlink("/usr/bin/grep", join(binDir, "grep"));
  for (const [name, version] of Object.entries(present)) {
    await writeFile(join(binDir, name), `#!/bin/bash\nprintf '%s\\n' '${version}'\n`, {
      mode: 0o755,
    });
  }
  return binDir;
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
    await writeFile(fstabFile, "", "utf-8");
    const binDir = await makeToolchainBin(scratch);

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
    expect(stdout).toContain(
      "[plan] would create system user 'a-user-that-should-never-exist-anywhere'",
    );
    expect(stdout).toContain(`[plan] would create directory '${appDir}'`);
    expect(stdout).toContain(`[plan] would create directory '${documentStoreDir}'`);
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
    await writeFile(excludeFile, ".cache/\n.bash_logout\n.bashrc\n.profile\n", "utf-8");
    const binDir = await makeToolchainBin(scratch, { node: "v24.1.0", pnpm: "11.11.0" });

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
      },
    });

    expect(stdout).toContain("[skip] node v24.1.0 (>= 24) and pnpm 11.11.0 already installed");
    expect(stdout).toContain(`[skip] user '${currentUser}' already exists`);
    expect(stdout).toContain(`[skip] directory '${appDir}' already exists`);
    expect(stdout).toContain(`[skip] directory '${documentStoreDir}' already exists`);
    expect(stdout).toContain(`[skip] swapfile '${swapFile}' already exists`);
    expect(stdout).toContain(
      `[skip] fstab entry for '${swapFile}' already present in '${fstabFile}'`,
    );
    // Guarded per line, not per file: a host provisioned before the skeleton
    // entries existed has `.cache/` only and must still gain the other three.
    for (const entry of [".cache/", ".bash_logout", ".bashrc", ".profile"]) {
      expect(stdout).toContain(`[skip] '${entry}' already present in '${excludeFile}'`);
    }
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
