import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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

// The assertions below interpolate real filesystem paths, so they compare
// literal substrings rather than building regexes out of them: a `TMPDIR`
// holding a regex metacharacter would loosen the match instead of failing.

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

    const { stdout } = await execFileAsync(SCRIPT, ["--dry-run"], {
      env: {
        ...process.env,
        SERVICE_USER: "a-user-that-should-never-exist-anywhere",
        APP_DIR: appDir,
        DOCUMENT_STORE_DIR: documentStoreDir,
        SWAP_FILE: swapFile,
        SWAP_SIZE_MB: "64",
        FSTAB_FILE: fstabFile,
        GIT_EXCLUDE_FILE: excludeFile,
      },
    });

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
    await writeFile(excludeFile, ".cache/\n", "utf-8");

    const { stdout } = await execFileAsync(SCRIPT, ["--dry-run"], {
      env: {
        ...process.env,
        SERVICE_USER: currentUser,
        APP_DIR: appDir,
        DOCUMENT_STORE_DIR: documentStoreDir,
        SWAP_FILE: swapFile,
        FSTAB_FILE: fstabFile,
        GIT_EXCLUDE_FILE: excludeFile,
      },
    });

    expect(stdout).toContain(`[skip] user '${currentUser}' already exists`);
    expect(stdout).toContain(`[skip] directory '${appDir}' already exists`);
    expect(stdout).toContain(`[skip] directory '${documentStoreDir}' already exists`);
    expect(stdout).toContain(`[skip] swapfile '${swapFile}' already exists`);
    expect(stdout).toContain(
      `[skip] fstab entry for '${swapFile}' already present in '${fstabFile}'`,
    );
    expect(stdout).toContain(`[skip] '.cache/' already present in '${excludeFile}'`);
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
