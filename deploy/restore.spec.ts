import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

/**
 * `restore.sh` is a loaded gun pointed at production: its entire job is to
 * overwrite a database and a document tree from a backup archive. The FIRST
 * thing it must do, before touching anything, is refuse when the target it
 * is about to write into is the box these backups exist to protect — a
 * tired operator at 2am reusing a shell that still has the production
 * `DATABASE_URL` exported must get a refusal, not a restored-over
 * production database.
 *
 * This guard compares the SAME env var names the app and every other
 * `deploy/*.sh` script already use (`DATABASE_URL`, `ALMACEN_DOCUMENTOS_RUTA`)
 * against the production values recorded in `$ENV_FILE` (default
 * `/etc/contratos/api.env` — the same file `deploy.sh`/`backup.sh` read),
 * never against a separate "restore target" variable name a rushed operator
 * would not think to check.
 */
const SCRIPT = join(import.meta.dirname, "restore.sh");

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
  throw new Error("expected restore.sh to exit with a non-zero status, but it succeeded");
}

const PROD_DATABASE_URL = "postgresql://contratos:secret@127.0.0.1:5432/contratos_prod";
const PROD_DOCUMENT_STORE_DIR = "/srv/contratos/documentos";

describe("restore.sh", () => {
  let scratch: string;

  beforeEach(async () => {
    scratch = await mkdtemp(join(tmpdir(), "restore-spec-"));
  });

  afterEach(async () => {
    // Nothing to clean up beyond the scratch dir itself — every test below
    // exists to prove restore.sh never wrote anything into it.
  });

  async function makeProdEnvFile(
    overrides: Record<string, string | undefined> = {},
  ): Promise<string> {
    const envFile = join(scratch, "api.env");
    const vars: Record<string, string | undefined> = {
      DATABASE_URL: PROD_DATABASE_URL,
      ALMACEN_DOCUMENTOS_RUTA: PROD_DOCUMENT_STORE_DIR,
      ...overrides,
    };
    const content =
      Object.entries(vars)
        .filter((entry): entry is [string, string] => entry[1] !== undefined)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n") + "\n";
    await writeFile(envFile, content, "utf-8");
    return envFile;
  }

  /** A scratch restore-target document directory with one pre-existing marker file, so a test can assert nothing new was written into it. */
  async function makeScratchDocumentStoreDir(): Promise<string> {
    const dir = join(scratch, "restore-target-documentos");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "marker.txt"), "pre-existing, must survive untouched\n", "utf-8");
    return dir;
  }

  // ------------------------------------------------------------- task 9.1

  it("refuses when the target DATABASE_URL equals the production database, before writing anything", async () => {
    const envFile = await makeProdEnvFile();
    const targetDocumentStoreDir = await makeScratchDocumentStoreDir();
    const filesBefore = (await readdir(targetDocumentStoreDir)).sort();

    const error = await expectToFail(
      execFileAsync(SCRIPT, [], {
        env: {
          ...process.env,
          ENV_FILE: envFile,
          DATABASE_URL: PROD_DATABASE_URL,
          ALMACEN_DOCUMENTOS_RUTA: targetDocumentStoreDir,
        },
      }),
    );

    expect(error.code).toBe(1);
    expect(error.stderr).toContain("DATABASE_URL");
    expect(error.stderr).toContain("production");
    const filesAfter = (await readdir(targetDocumentStoreDir)).sort();
    expect(filesAfter).toEqual(filesBefore);
  });

  it("refuses when the target ALMACEN_DOCUMENTOS_RUTA equals the production document store, before writing anything", async () => {
    const envFile = await makeProdEnvFile();

    const error = await expectToFail(
      execFileAsync(SCRIPT, [], {
        env: {
          ...process.env,
          ENV_FILE: envFile,
          DATABASE_URL: "postgresql://scratch:scratch@127.0.0.1:5432/scratch_restore",
          ALMACEN_DOCUMENTOS_RUTA: PROD_DOCUMENT_STORE_DIR,
        },
      }),
    );

    expect(error.code).toBe(1);
    expect(error.stderr).toContain("ALMACEN_DOCUMENTOS_RUTA");
    expect(error.stderr).toContain("production");
  });

  it("does not trip the production-target guard when both targets differ from production — proceeds to the next preflight guard instead", async () => {
    const envFile = await makeProdEnvFile();
    const targetDocumentStoreDir = await makeScratchDocumentStoreDir();

    // With both targets genuinely scratch, the production-target guard must
    // not be what stops this run. It should fail later, on the very next
    // guard (a missing $ARCHIVE_FILE) — proving the first guard evaluated
    // real values instead of hardcoding a refusal.
    const error = await expectToFail(
      execFileAsync(SCRIPT, [], {
        env: {
          ...process.env,
          ENV_FILE: envFile,
          DATABASE_URL: "postgresql://scratch:scratch@127.0.0.1:5432/scratch_restore",
          ALMACEN_DOCUMENTOS_RUTA: targetDocumentStoreDir,
        },
      }),
    );

    expect(error.code).toBe(1);
    expect(error.stderr).not.toContain("production");
    expect(error.stderr).toContain("ARCHIVE_FILE");
  });

  it("does not trip the production-target guard when $ENV_FILE does not exist — a scratch host normally has no production config to compare against", async () => {
    const targetDocumentStoreDir = await makeScratchDocumentStoreDir();

    const error = await expectToFail(
      execFileAsync(SCRIPT, [], {
        env: {
          ...process.env,
          ENV_FILE: join(scratch, "no-such-api.env"),
          DATABASE_URL: PROD_DATABASE_URL,
          ALMACEN_DOCUMENTOS_RUTA: targetDocumentStoreDir,
        },
      }),
    );

    expect(error.code).toBe(1);
    expect(error.stderr).not.toContain("production");
    expect(error.stderr).toContain("ARCHIVE_FILE");
  });

  // --------------------------------------------------------- housekeeping

  it("refuses a document target that is not empty, which could hide the very corruption the drill exists to catch", async () => {
    // do_restore_documents copies additively (`cp -a src/. dst/`) and never
    // clears the target. A file left by an earlier drill at the same path
    // therefore satisfies verificarRestauracion's `faltantes` check for a
    // row whose PDF is MISSING from this archive — and, being the same
    // document, its sha256 matches too. The drill then passes on a backup
    // that cannot actually be restored, which is the one outcome the
    // go-live gate depends on it never producing.
    const targetDocumentStoreDir = await makeScratchDocumentStoreDir();
    const archiveFile = join(scratch, "contratos-backup-fixture.tar.enc");
    await writeFile(archiveFile, "no-hace-falta-que-sea-real\n", "utf-8");

    const error = await expectToFail(
      execFileAsync(SCRIPT, [], {
        env: {
          ...process.env,
          ENV_FILE: join(scratch, "no-such-api.env"),
          DATABASE_URL: "postgresql://scratch:scratch@127.0.0.1:5432/scratch_restore",
          ALMACEN_DOCUMENTOS_RUTA: targetDocumentStoreDir,
          ARCHIVE_FILE: archiveFile,
        },
      }),
    );

    expect(error.code).toBe(1);
    expect(error.stderr).toContain(targetDocumentStoreDir);
    // Refuses, never clears: the operator decides what to delete.
    await expect(
      readFile(join(targetDocumentStoreDir, "marker.txt"), "utf-8"),
    ).resolves.toContain("pre-existing");
  });

  it("picks the decryption tool from what the operator configured, not from what is installed", async () => {
    // The tool has to match how the ARCHIVE was encrypted — a property of
    // the archive, not of the scratch host. Selecting on $PATH means an
    // installed `age` demands an age identity for a gpg-encrypted archive.
    const targetDocumentStoreDir = join(scratch, "empty-target");
    await mkdir(targetDocumentStoreDir, { recursive: true });
    const archiveFile = join(scratch, "gpg-encrypted.tar.enc");
    await writeFile(archiveFile, "pretend this is gpg output\n", "utf-8");

    const binDir = join(scratch, "bin");
    await mkdir(binDir, { recursive: true });
    const ageStub = join(binDir, "age");
    await writeFile(ageStub, "#!/usr/bin/env bash\nexit 0\n", "utf-8");
    await chmod(ageStub, 0o755);

    const error = await expectToFail(
      execFileAsync(SCRIPT, [], {
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH}`,
          ENV_FILE: join(scratch, "no-such-api.env"),
          DATABASE_URL: "postgresql://scratch:scratch@127.0.0.1:5432/scratch_restore",
          ALMACEN_DOCUMENTOS_RUTA: targetDocumentStoreDir,
          ARCHIVE_FILE: archiveFile,
        },
      }),
    );

    expect(error.stderr).not.toContain("AGE_IDENTITY_FILE");
  });

  it("rejects an unrecognized flag instead of silently proceeding", async () => {
    await expect(
      execFileAsync(SCRIPT, ["--not-a-real-flag"], {
        env: { ...process.env },
      }),
    ).rejects.toMatchObject({ code: 1 });
  });

  it("requires $DATABASE_URL and $ALMACEN_DOCUMENTOS_RUTA to be set at all", async () => {
    const envFile = await makeProdEnvFile();

    const error = await expectToFail(
      execFileAsync(SCRIPT, [], {
        env: {
          ...process.env,
          ENV_FILE: envFile,
          DATABASE_URL: "",
          ALMACEN_DOCUMENTOS_RUTA: "",
        },
      }),
    );

    expect(error.code).toBe(1);
    expect(error.stderr).toContain("DATABASE_URL");
  });
});
