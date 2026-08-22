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
        FSTAB_FILE: fstabFile,
        GIT_EXCLUDE_FILE: excludeFile,
      },
    });

    expect(stdout).toMatch(
      /\[plan] would create system user 'a-user-that-should-never-exist-anywhere'/,
    );
    expect(stdout).toMatch(new RegExp(`\\[plan] would create directory '${appDir}'`));
    expect(stdout).toMatch(
      new RegExp(`\\[plan] would create directory '${documentStoreDir}'`),
    );
    expect(stdout).toMatch(new RegExp(`\\[plan] would create .* swapfile at '${swapFile}'`));
    expect(stdout).toMatch(
      new RegExp(`\\[plan] would append '${swapFile} none swap sw 0 0' to '${fstabFile}'`),
    );
    expect(stdout).toMatch(new RegExp(`\\[plan] would append '\\.cache/' to '${excludeFile}'`));
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

    expect(stdout).toMatch(new RegExp(`\\[skip] user '${currentUser}' already exists`));
    expect(stdout).toMatch(new RegExp(`\\[skip] directory '${appDir}' already exists`));
    expect(stdout).toMatch(
      new RegExp(`\\[skip] directory '${documentStoreDir}' already exists`),
    );
    expect(stdout).toMatch(new RegExp(`\\[skip] swapfile '${swapFile}' already exists`));
    expect(stdout).toMatch(
      new RegExp(`\\[skip] fstab entry for '${swapFile}' already present in '${fstabFile}'`),
    );
    expect(stdout).toMatch(
      new RegExp(`\\[skip] '\\.cache/' already present in '${excludeFile}'`),
    );
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

  it("rejects an unrecognized flag instead of silently proceeding", async () => {
    await expect(execFileAsync(SCRIPT, ["--not-a-real-flag"])).rejects.toMatchObject({
      code: 1,
    });
  });
});
