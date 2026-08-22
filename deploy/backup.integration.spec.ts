import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

const SCRIPT = join(import.meta.dirname, "backup.sh");

/**
 * `contract-archive-backup` spec.md, "Database-before-PDFs backup ordering",
 * scenario "Step order (pre-VPS, integration-tested)":
 *
 *   WHEN run against CI's existing Postgres 17 container plus a scratch PDF
 *   directory THEN the `pg_dump` step completes before the PDF-copy step
 *   begins, **verifiable by observing step completion order**.
 *
 * `backup.spec.ts` only asserts the order of the `--dry-run` plan strings,
 * which is a description of the script rather than a run of it: swap the two
 * calls in `main()` and leave the plan text alone and that assertion still
 * passes. This spec observes the real thing.
 *
 * `pg_dump` and `cp` are wrapped by thin shims that record a marker and then
 * `exec` the real binary at its absolute path — so a real `pg_dump` runs
 * against the real database and a real `cp` copies the tree, while the order
 * in which the two steps start and finish becomes observable. `backup.sh`
 * calls each of them exactly once (`backup.sh:251` and `backup.sh:258`), so
 * the log has one pair of markers per step.
 *
 * Ordering matters because it is asymmetric, not because it is tidy: dumping
 * first can strand a PDF no row points at, which is harmless. Copying first
 * can leave a `contrato_documentos` row whose PDF is absent from the backup —
 * evidence of a signed comodato the backup then fails to preserve.
 */
const DATABASE_URL =
  process.env["DATABASE_URL"] ?? "postgresql://contratos:contratos@127.0.0.1:5432/contratos";

/** Absolute path of a real binary, resolved before any shim reaches `$PATH`. */
async function realPathOf(command: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("bash", ["-c", `command -v ${command}`]);
    return stdout.trim();
  } catch {
    throw new Error(
      `${command} is not on $PATH. This spec runs the real backup pipeline, so it needs it — ` +
        `postgresql-client must match the server's major version (17). Install it rather than ` +
        `skipping: a backup suite that quietly stops exercising pg_dump proves nothing.`,
    );
  }
}

describe("backup.sh (integration — real pg_dump against Postgres 17)", () => {
  let scratch: string;

  beforeEach(async () => {
    scratch = await mkdtemp(join(tmpdir(), "backup-integration-"));
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  async function writeExecutable(path: string, body: string): Promise<void> {
    await writeFile(path, body, "utf-8");
    await chmod(path, 0o755);
  }

  it("completes the pg_dump before the PDF copy begins, observed on a real run", async () => {
    const realPgDump = await realPathOf("pg_dump");
    const realCp = await realPathOf("cp");

    const binDir = join(scratch, "bin");
    const orderLog = join(scratch, "step-order.log");
    await mkdir(binDir, { recursive: true });

    for (const [name, real] of [
      ["pg_dump", realPgDump],
      ["cp", realCp],
    ] as const) {
      await writeExecutable(
        join(binDir, name),
        `#!/usr/bin/env bash\n` +
          `printf '%s\\n' "${name}:start" >> "${orderLog}"\n` +
          `"${real}" "$@"\n` +
          `status=$?\n` +
          `printf '%s\\n' "${name}:end" >> "${orderLog}"\n` +
          `exit "$status"\n`,
      );
    }

    // Absolute path on purpose: the encrypt stub must not trip the `cp` shim,
    // which would add markers for a step this test is not observing.
    await writeExecutable(
      join(scratch, "encrypt-stub.sh"),
      `#!/usr/bin/env bash\nexec "${realCp}" "$1" "$2"\n`,
    );

    // Enough rclone to satisfy the push and report an empty remote, so the
    // retention prune has nothing to do and stays out of this test's way.
    await writeExecutable(
      join(binDir, "rclone"),
      `#!/usr/bin/env bash\ncase "$1" in\n  lsjson) : ;;\n  *) : ;;\nesac\nexit 0\n`,
    );

    const envFile = join(scratch, "api.env");
    await writeFile(envFile, `DATABASE_URL=${DATABASE_URL}\n`, "utf-8");

    const backupEnvFile = join(scratch, "backup.env");
    await writeFile(
      backupEnvFile,
      "RCLONE_REMOTE=stubremote:backups\nGPG_RECIPIENT=0000000000000000000000000000000000000000\n",
      "utf-8",
    );

    const documentStoreDir = join(scratch, "documentos");
    await mkdir(documentStoreDir, { recursive: true });
    await writeFile(join(documentStoreDir, "contrato-1.pdf"), "%PDF-fixture\n", "utf-8");

    const workDir = join(scratch, "work");

    await execFileAsync(SCRIPT, [], {
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env["PATH"] ?? ""}`,
        ENV_FILE: envFile,
        BACKUP_ENV_FILE: backupEnvFile,
        DOCUMENT_STORE_DIR: documentStoreDir,
        BACKUP_WORK_DIR: workDir,
        ENCRYPT_SCRIPT: join(scratch, "encrypt-stub.sh"),
      },
    });

    const order = (await readFile(orderLog, "utf-8")).trim().split("\n");

    // Not "dump before copy" loosely — the dump must be FINISHED before the
    // copy has even started, which is what makes an orphan PDF the only
    // reachable inconsistency.
    expect(order).toEqual(["pg_dump:start", "pg_dump:end", "cp:start", "cp:end"]);
  });

  it("produces an archive holding a real custom-format dump beside the PDF tree", async () => {
    // Resolved for its side effect too: it fails with a named error when
    // pg_dump is absent, rather than letting backup.sh die further in.
    await realPathOf("pg_dump");
    const realCp = await realPathOf("cp");

    const binDir = join(scratch, "bin");
    await mkdir(binDir, { recursive: true });
    await writeExecutable(
      join(binDir, "rclone"),
      `#!/usr/bin/env bash\ncase "$1" in\n  lsjson) : ;;\n  *) : ;;\nesac\nexit 0\n`,
    );
    await writeExecutable(
      join(scratch, "encrypt-stub.sh"),
      `#!/usr/bin/env bash\nexec "${realCp}" "$1" "$2"\n`,
    );

    const envFile = join(scratch, "api.env");
    await writeFile(envFile, `DATABASE_URL=${DATABASE_URL}\n`, "utf-8");
    const backupEnvFile = join(scratch, "backup.env");
    await writeFile(
      backupEnvFile,
      "RCLONE_REMOTE=stubremote:backups\nGPG_RECIPIENT=0000000000000000000000000000000000000000\n",
      "utf-8",
    );

    const documentStoreDir = join(scratch, "documentos");
    await mkdir(documentStoreDir, { recursive: true });
    await writeFile(join(documentStoreDir, "contrato-1.pdf"), "%PDF-fixture\n", "utf-8");

    const workDir = join(scratch, "work");

    await execFileAsync(SCRIPT, [], {
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env["PATH"] ?? ""}`,
        ENV_FILE: envFile,
        BACKUP_ENV_FILE: backupEnvFile,
        DOCUMENT_STORE_DIR: documentStoreDir,
        BACKUP_WORK_DIR: workDir,
        ENCRYPT_SCRIPT: join(scratch, "encrypt-stub.sh"),
      },
    });

    const produced = (await readdir(workDir)).filter((name) => name.endsWith(".tar.enc"));
    expect(produced).toHaveLength(1);

    const archive = join(workDir, produced[0]!);
    const { stdout: listing } = await execFileAsync("tar", ["-tf", archive]);
    expect(listing).toContain("database.dump");
    expect(listing).toContain("documentos/contrato-1.pdf");

    // `PGDMP` is the custom-format magic. Asserting it is what separates
    // "pg_dump ran against a real server" from "a file appeared at that path".
    const extractTo = join(scratch, "extracted");
    await mkdir(extractTo, { recursive: true });
    await execFileAsync("tar", ["-C", extractTo, "-xf", archive, "database.dump"]);
    const dump = await readFile(join(extractTo, "database.dump"));
    expect(dump.subarray(0, 5).toString("latin1")).toBe("PGDMP");
    expect(dump.byteLength).toBeGreaterThan(0);
  });
});
