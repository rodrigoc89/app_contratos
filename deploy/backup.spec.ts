import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

/**
 * design.md D7's falsifiability argument, in one line: dumping the database
 * BEFORE copying the PDF tree can only ever strand a harmless orphan PDF;
 * the reverse order can strand a `contrato_documentos` row whose PDF is
 * absent from the backup — unrecoverable evidence of a signed comodato.
 * `--dry-run` proves that ordering for real, no VPS needed (design.md D8).
 *
 * Retention pruning (`--prune-only`) is exercised for real too, against a
 * mocked `rclone` binary on $PATH (same PATH-injection pattern as
 * `tls-bootstrap.spec.ts`/`renewal-hook-nginx.spec.ts`) — real `rclone` is
 * not installed on this machine, and even if it were, these specs must
 * never touch a real remote. The stub treats a local scratch directory as
 * the "remote", so the prune arithmetic itself (list, sort, keep newest,
 * delete the rest) runs unmocked.
 *
 * The full dump→copy→archive→encrypt→push pipeline needs a live
 * PostgreSQL instance (`pg_dump`) and a real `rclone` remote — neither
 * available pre-VPS — so it is implemented but, like `deploy.sh`'s
 * stop/checkout/install/migrate steps, only ever exercised through
 * `--dry-run`'s guards and printed plan here.
 */
const SCRIPT = join(import.meta.dirname, "backup.sh");

interface ExecError extends Error {
  code: number;
  stdout: string;
  stderr: string;
}

async function expectToFail(promise: Promise<unknown>): Promise<ExecError> {
  try {
    await promise;
  } catch (error) {
    return error as ExecError;
  }
  throw new Error("expected backup.sh to exit with a non-zero status, but it succeeded");
}

/** `YYYYMMDDThhmmssZ`, matching `publicar-assets.sh`'s manifest naming — a real UTC date so a lexical sort is also a chronological sort. */
function timestampFor(dayOffsetFromEpochStart: number): string {
  const date = new Date(Date.UTC(2026, 0, 1 + dayOffsetFromEpochStart));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T000000Z`;
}

describe("backup.sh", () => {
  let scratch: string;

  beforeEach(async () => {
    scratch = await mkdtemp(join(tmpdir(), "backup-spec-"));
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  async function makeValidEnvFile(): Promise<string> {
    const envFile = join(scratch, "api.env");
    await writeFile(envFile, "DATABASE_URL=postgresql://user:pass@localhost:5432/contratos\n", "utf-8");
    return envFile;
  }

  async function makeValidBackupEnvFile(
    overrides: Record<string, string | undefined> = {},
  ): Promise<string> {
    const backupEnvFile = join(scratch, "backup.env");
    const vars: Record<string, string | undefined> = {
      RCLONE_REMOTE: "stubremote:backups",
      // This dev machine has no `age` binary installed — resolving
      // ENCRYPTION_TOOL falls back to gpg here, so GPG_RECIPIENT is the
      // variable actually required. See encrypt-backup-archive.spec.ts for
      // the real round trip and the age-preference proof.
      GPG_RECIPIENT: "0000000000000000000000000000000000000000",
      ...overrides,
    };
    const content =
      Object.entries(vars)
        .filter((entry): entry is [string, string] => entry[1] !== undefined)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n") + "\n";
    await writeFile(backupEnvFile, content, "utf-8");
    return backupEnvFile;
  }

  async function makeDocumentStoreDir(): Promise<string> {
    const dir = join(scratch, "documentos");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "contrato-1.pdf"), "%PDF-fake-fixture\n", "utf-8");
    return dir;
  }

  async function makeRcloneStub(remoteStoreRoot: string): Promise<{ binDir: string; logFile: string }> {
    const binDir = join(scratch, "bin");
    await mkdir(binDir, { recursive: true });
    const logFile = join(scratch, "rclone-calls.log");
    const rcloneScript = join(binDir, "rclone");
    await writeFile(
      rcloneScript,
      [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        'cmd="$1"; shift',
        'case "$cmd" in',
        "  lsjson)",
        '    remote_arg="$1"',
        '    relpath="${remote_arg#*:}"',
        `    dir="${remoteStoreRoot}/\${relpath}"`,
        '    if [ -d "$dir" ]; then',
        '      for f in "$dir"/*; do',
        '        [ -e "$f" ] || continue',
        '        name="$(basename "$f")"',
        "        printf '{\"Name\":\"%s\",\"Path\":\"%s\",\"IsDir\":false}\\n' \"$name\" \"$name\"",
        "      done",
        "    fi",
        "    ;;",
        "  deletefile)",
        '    remote_arg="$1"',
        '    relpath="${remote_arg#*:}"',
        `    echo "deletefile \${relpath}" >> "${logFile}"`,
        `    rm -f "${remoteStoreRoot}/\${relpath}"`,
        "    ;;",
        "  copyto)",
        '    src="$1"; dst="$2"',
        '    dst_relpath="${dst#*:}"',
        `    mkdir -p "$(dirname "${remoteStoreRoot}/\${dst_relpath}")"`,
        `    cp "$src" "${remoteStoreRoot}/\${dst_relpath}"`,
        `    echo "copyto \${dst_relpath}" >> "${logFile}"`,
        "    ;;",
        "  *)",
        "    echo \"rclone-stub: unsupported subcommand '$cmd'\" >&2",
        "    exit 1",
        "    ;;",
        "esac",
        "",
      ].join("\n"),
      "utf-8",
    );
    await chmod(rcloneScript, 0o755);
    return { binDir, logFile };
  }

  // ------------------------------------------------------------- task 8.1

  it("prints the backup plan with the pg_dump step strictly before the PDF-tree copy step", async () => {
    const envFile = await makeValidEnvFile();
    const backupEnvFile = await makeValidBackupEnvFile();
    const documentStoreDir = await makeDocumentStoreDir();

    const { stdout } = await execFileAsync(SCRIPT, ["--dry-run"], {
      env: {
        ...process.env,
        ENV_FILE: envFile,
        BACKUP_ENV_FILE: backupEnvFile,
        DOCUMENT_STORE_DIR: documentStoreDir,
      },
    });

    const dumpIndex = stdout.indexOf("[plan:dump]");
    const copyIndex = stdout.indexOf("[plan:copy-documents]");

    expect(dumpIndex, "missing [plan:dump] marker in stdout").toBeGreaterThanOrEqual(0);
    expect(copyIndex, "missing [plan:copy-documents] marker in stdout").toBeGreaterThanOrEqual(0);
    expect(dumpIndex).toBeLessThan(copyIndex);
  });

  it("lists the full plan in dump → copy-documents → archive → encrypt → push → prune-remote → prune-local order", async () => {
    const envFile = await makeValidEnvFile();
    const backupEnvFile = await makeValidBackupEnvFile();
    const documentStoreDir = await makeDocumentStoreDir();

    const { stdout } = await execFileAsync(SCRIPT, ["--dry-run"], {
      env: {
        ...process.env,
        ENV_FILE: envFile,
        BACKUP_ENV_FILE: backupEnvFile,
        DOCUMENT_STORE_DIR: documentStoreDir,
      },
    });

    const steps = [
      "[plan:dump]",
      "[plan:copy-documents]",
      "[plan:archive]",
      "[plan:encrypt]",
      "[plan:push]",
      "[plan:prune-remote]",
      "[plan:prune-local]",
    ];
    const indices = steps.map((marker) => stdout.indexOf(marker));
    steps.forEach((marker, i) => {
      expect(indices[i], `missing ${marker} marker in stdout`).toBeGreaterThanOrEqual(0);
    });
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1]!);
    }
  });

  // ------------------------------------------------------------- task 8.5

  it("retains exactly the 30 most recent remote artifacts when 31+ are present, pruning the rest", async () => {
    const backupEnvFile = await makeValidBackupEnvFile();
    const remoteStoreRoot = join(scratch, "remote-store");
    const remoteBackupsDir = join(remoteStoreRoot, "backups");
    await mkdir(remoteBackupsDir, { recursive: true });

    const names: string[] = [];
    for (let i = 0; i < 32; i++) {
      const name = `contratos-backup-${timestampFor(i)}.tar.enc`;
      names.push(name);
      await writeFile(join(remoteBackupsDir, name), "fixture", "utf-8");
    }

    const { binDir, logFile } = await makeRcloneStub(remoteStoreRoot);

    await execFileAsync(SCRIPT, ["--prune-only"], {
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH}`,
        BACKUP_ENV_FILE: backupEnvFile,
        BACKUP_WORK_DIR: join(scratch, "local-work"),
      },
    });

    const remaining = (await readdir(remoteBackupsDir)).sort();
    expect(remaining).toHaveLength(30);
    // The 2 oldest must be gone; the 30 newest, including the very latest, remain.
    expect(remaining).not.toContain(names[0]);
    expect(remaining).not.toContain(names[1]);
    expect(remaining).toContain(names[2]);
    expect(remaining).toContain(names[31]);

    const deleteCalls = (await readFile(logFile, "utf-8"))
      .trim()
      .split("\n")
      .filter((line) => line.startsWith("deletefile"));
    expect(deleteCalls).toHaveLength(2);
  });

  it("does NOT prune the remote when at or under 30 artifacts are present", async () => {
    const backupEnvFile = await makeValidBackupEnvFile();
    const remoteStoreRoot = join(scratch, "remote-store");
    const remoteBackupsDir = join(remoteStoreRoot, "backups");
    await mkdir(remoteBackupsDir, { recursive: true });

    for (let i = 0; i < 5; i++) {
      await writeFile(join(remoteBackupsDir, `contratos-backup-${timestampFor(i)}.tar.enc`), "fixture", "utf-8");
    }

    const { binDir, logFile } = await makeRcloneStub(remoteStoreRoot);

    await execFileAsync(SCRIPT, ["--prune-only"], {
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH}`,
        BACKUP_ENV_FILE: backupEnvFile,
        BACKUP_WORK_DIR: join(scratch, "local-work"),
      },
    });

    const remaining = await readdir(remoteBackupsDir);
    expect(remaining).toHaveLength(5);
    await expect(readFile(logFile, "utf-8").catch(() => "")).resolves.not.toContain("deletefile");
  });

  it("retains exactly the 2 most recent local copies when more are present", async () => {
    const backupEnvFile = await makeValidBackupEnvFile();
    const remoteStoreRoot = join(scratch, "remote-store");
    await mkdir(join(remoteStoreRoot, "backups"), { recursive: true });
    const { binDir } = await makeRcloneStub(remoteStoreRoot);

    const localWorkDir = join(scratch, "local-work");
    await mkdir(localWorkDir, { recursive: true });
    const localNames: string[] = [];
    for (let i = 0; i < 4; i++) {
      const name = `contratos-backup-${timestampFor(i)}.tar.enc`;
      localNames.push(name);
      await writeFile(join(localWorkDir, name), "fixture", "utf-8");
    }

    await execFileAsync(SCRIPT, ["--prune-only"], {
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH}`,
        BACKUP_ENV_FILE: backupEnvFile,
        BACKUP_WORK_DIR: localWorkDir,
      },
    });

    const remaining = (await readdir(localWorkDir)).sort();
    expect(remaining).toEqual([localNames[2], localNames[3]]);
  });

  // --------------------------------------------------------- housekeeping

  it("never deletes a remote file that is not one of its own backup artifacts", async () => {
    // `rclone lsjson` lists everything at the remote path, and the prune
    // deletes the lexically-first entries. An operator's own file sharing
    // that bucket counts toward the total AND gets deleted as an "old
    // backup" — do_prune_local already filters on '*.tar.enc'; the remote
    // side did not.
    const backupEnvFile = await makeValidBackupEnvFile();
    const remoteStoreRoot = join(scratch, "remote-store");
    const remoteBackupsDir = join(remoteStoreRoot, "backups");
    await mkdir(remoteBackupsDir, { recursive: true });

    for (let i = 0; i < 31; i++) {
      await writeFile(
        join(remoteBackupsDir, `contratos-backup-${timestampFor(i)}.tar.enc`),
        "fixture",
        "utf-8",
      );
    }
    // Sorts before every 'contratos-...' name, so it is pruned first.
    await writeFile(join(remoteBackupsDir, "LEEME.txt"), "no es un backup\n", "utf-8");

    const { binDir } = await makeRcloneStub(remoteStoreRoot);

    await execFileAsync(SCRIPT, ["--prune-only"], {
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH}`,
        BACKUP_ENV_FILE: backupEnvFile,
        BACKUP_WORK_DIR: join(scratch, "local-work"),
      },
    });

    const remaining = await readdir(remoteBackupsDir);
    expect(remaining).toContain("LEEME.txt");
    expect(remaining.filter((name) => name.endsWith(".tar.enc"))).toHaveLength(30);
  });

  it("fails loudly when the remote cannot be listed, instead of reading it as an empty remote", async () => {
    // A remote this script cannot reach must never look like a remote
    // holding no backups: that reads as "nothing to prune" and reports
    // success on a run that proved nothing about the offsite copy.
    const backupEnvFile = await makeValidBackupEnvFile();
    const binDir = join(scratch, "bin");
    await mkdir(binDir, { recursive: true });
    const rcloneStub = join(binDir, "rclone");
    await writeFile(
      rcloneStub,
      "#!/usr/bin/env bash\necho 'rclone: connection refused' >&2\nexit 1\n",
      "utf-8",
    );
    await chmod(rcloneStub, 0o755);

    const error = await expectToFail(
      execFileAsync(SCRIPT, ["--prune-only"], {
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH}`,
          BACKUP_ENV_FILE: backupEnvFile,
          BACKUP_WORK_DIR: join(scratch, "local-work"),
        },
      }),
    );

    expect(error.code).not.toBe(0);
  });

  it("refuses a RETENTION_REMOTE_COUNT of 0, which would delete every offsite backup ever taken", async () => {
    // The remote copy is the only one that survives losing the VPS. Keeping
    // zero of them does not just skip a prune: it deletes the whole history
    // including the artifact this very run pushed.
    const backupEnvFile = await makeValidBackupEnvFile();
    const remoteStoreRoot = join(scratch, "remote-store");
    const remoteBackupsDir = join(remoteStoreRoot, "backups");
    await mkdir(remoteBackupsDir, { recursive: true });
    await writeFile(
      join(remoteBackupsDir, `contratos-backup-${timestampFor(0)}.tar.enc`),
      "fixture",
      "utf-8",
    );

    const { binDir } = await makeRcloneStub(remoteStoreRoot);

    const error = await expectToFail(
      execFileAsync(SCRIPT, ["--prune-only"], {
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH}`,
          BACKUP_ENV_FILE: backupEnvFile,
          BACKUP_WORK_DIR: join(scratch, "local-work"),
          RETENTION_REMOTE_COUNT: "0",
        },
      }),
    );

    expect(error.code).toBe(1);
    expect(error.stderr).toContain("RETENTION_REMOTE_COUNT");
    await expect(readdir(remoteBackupsDir)).resolves.toHaveLength(1);
  });

  it("uses the encryption tool the operator configured, not whichever one is installed", async () => {
    // Same defect encrypt-backup-archive.sh had: this script kept its own
    // copy of the $PATH-based selection, so a host configured for gpg stops
    // backing up the moment anything pulls `age` onto it.
    const backupEnvFile = await makeValidBackupEnvFile();
    const binDir = join(scratch, "bin");
    await mkdir(binDir, { recursive: true });
    const ageStub = join(binDir, "age");
    await writeFile(ageStub, "#!/usr/bin/env bash\nexit 0\n", "utf-8");
    await chmod(ageStub, 0o755);

    const { stdout } = await execFileAsync(SCRIPT, ["--dry-run"], {
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH}`,
        BACKUP_ENV_FILE: backupEnvFile,
        ENV_FILE: await makeValidEnvFile(),
        DOCUMENT_STORE_DIR: await makeDocumentStoreDir(),
        BACKUP_WORK_DIR: join(scratch, "local-work"),
      },
    });

    expect(stdout).toContain("encryption=gpg");
  });

  it("rejects an unrecognized flag instead of silently proceeding", async () => {
    const envFile = await makeValidEnvFile();
    const backupEnvFile = await makeValidBackupEnvFile();
    const documentStoreDir = await makeDocumentStoreDir();

    await expect(
      execFileAsync(SCRIPT, ["--not-a-real-flag"], {
        env: {
          ...process.env,
          ENV_FILE: envFile,
          BACKUP_ENV_FILE: backupEnvFile,
          DOCUMENT_STORE_DIR: documentStoreDir,
        },
      }),
    ).rejects.toMatchObject({ code: 1 });
  });

  it("aborts before printing any plan when BACKUP_ENV_FILE has no RCLONE_REMOTE, naming the variable", async () => {
    const envFile = await makeValidEnvFile();
    const backupEnvFile = await makeValidBackupEnvFile({ RCLONE_REMOTE: undefined });
    const documentStoreDir = await makeDocumentStoreDir();

    const error = await expectToFail(
      execFileAsync(SCRIPT, ["--dry-run"], {
        env: {
          ...process.env,
          ENV_FILE: envFile,
          BACKUP_ENV_FILE: backupEnvFile,
          DOCUMENT_STORE_DIR: documentStoreDir,
        },
      }),
    );

    expect(error.code).toBe(1);
    expect(error.stderr).toContain("RCLONE_REMOTE");
    expect(error.stdout).not.toContain("[plan:");
  });
});
