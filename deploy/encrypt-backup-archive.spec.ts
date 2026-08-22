import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

/**
 * design.md D7's whole property in one sentence: no key capable of
 * decrypting an offsite backup may live on the VPS that produced it. Both
 * supported tools satisfy this the same way — asymmetric encryption, never
 * a symmetric passphrase — which is why `gpg --recipient` is an acceptable
 * fallback even though `gpg --symmetric` was explicitly rejected in
 * design.md: the rejected choice is the symmetric mode, not gpg itself.
 *
 * `age` is confirmed packaged for the target Ubuntu release (verified
 * against packages.ubuntu.com for both 22.04/jammy and 24.04/noble — both
 * return a real "Package: age" page, in `universe`) so it is the preferred
 * tool. It is NOT, however, an installed binary on this development
 * machine (`command -v age` fails here; only `gpg` is present) and this
 * apply run does not install system packages. The real round-trip test
 * below therefore exercises the `gpg --recipient` FALLBACK path for real —
 * that is the tool this environment can actually prove. A second,
 * structural test proves the SELECTION logic prefers `age` whenever it is
 * present on $PATH, using a mocked `age` binary (same PATH-injection
 * pattern as `renewal-hook-nginx.spec.ts`).
 */
const SCRIPT = join(import.meta.dirname, "encrypt-backup-archive.sh");

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
  throw new Error("expected encrypt-backup-archive.sh to exit with a non-zero status, but it succeeded");
}

describe("encrypt-backup-archive.sh", () => {
  let scratch: string;

  beforeEach(async () => {
    scratch = await mkdtemp(join(tmpdir(), "encrypt-backup-archive-spec-"));
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  // --------------------------------------------------------------- task 8.3

  it(
    "encrypts and decrypts a fixture byte-identically via the real gpg --recipient fallback, " +
      "and refuses to decrypt without the secret key",
    async () => {
      const gnupgHome = join(scratch, "gnupghome");
      await mkdir(gnupgHome, { recursive: true, mode: 0o700 });
      await chmod(gnupgHome, 0o700);

      await execFileAsync(
        "gpg",
        [
          "--batch",
          "--passphrase",
          "",
          "--quick-generate-key",
          "encrypt-backup-archive-spec@contratos.invalid",
          "default",
          "default",
          "never",
        ],
        { env: { ...process.env, GNUPGHOME: gnupgHome } },
      );

      const { stdout: fprOutput } = await execFileAsync(
        "gpg",
        ["--list-keys", "--with-colons"],
        { env: { ...process.env, GNUPGHOME: gnupgHome } },
      );
      const fingerprint = fprOutput
        .split("\n")
        .find((line) => line.startsWith("fpr:"))
        ?.split(":")[9];
      expect(fingerprint).toBeTruthy();

      const fixtureFile = join(scratch, "fixture.txt");
      const fixtureContent = "nombre=José Pérez dni=12345678 firma=comodante\n";
      await writeFile(fixtureFile, fixtureContent, "utf-8");
      const encryptedFile = join(scratch, "fixture.txt.enc");

      await execFileAsync(SCRIPT, [fixtureFile, encryptedFile], {
        env: { ...process.env, GNUPGHOME: gnupgHome, GPG_RECIPIENT: fingerprint! },
      });

      // Ciphertext must not equal the plaintext bytes.
      const encryptedBytes = await readFile(encryptedFile);
      const plaintextBytes = await readFile(fixtureFile);
      expect(encryptedBytes.equals(plaintextBytes)).toBe(false);

      // Round trip, WITH the key: byte-identical.
      const decryptedFile = join(scratch, "fixture.decrypted.txt");
      await execFileAsync(
        "gpg",
        ["--batch", "--yes", "--output", decryptedFile, "--decrypt", encryptedFile],
        { env: { ...process.env, GNUPGHOME: gnupgHome } },
      );
      const decryptedContent = await readFile(decryptedFile, "utf-8");
      expect(decryptedContent).toBe(fixtureContent);

      // WITHOUT the key: refuses, never produces readable output.
      const emptyGnupgHome = join(scratch, "empty-gnupghome");
      await mkdir(emptyGnupgHome, { recursive: true, mode: 0o700 });
      await chmod(emptyGnupgHome, 0o700);
      const failedDecryptFile = join(scratch, "should-not-exist.txt");

      const error = await expectToFail(
        execFileAsync(
          "gpg",
          ["--batch", "--yes", "--output", failedDecryptFile, "--decrypt", encryptedFile],
          { env: { ...process.env, GNUPGHOME: emptyGnupgHome } },
        ),
      );
      expect(error.code).not.toBe(0);
      await expect(readFile(failedDecryptFile, "utf-8")).rejects.toThrow();
    },
  );

  // --------------------------------------------------------------- task 8.3

  it("prefers age over gpg when age is present on $PATH", async () => {
    const binDir = join(scratch, "bin");
    const logFile = join(scratch, "age-calls.log");
    await mkdir(binDir, { recursive: true });

    const ageStub = join(binDir, "age");
    await writeFile(
      ageStub,
      `#!/usr/bin/env bash\necho "age $*" >> "${logFile}"\n` +
        // Mimic "-r RECIPIENT -o OUTPUT INPUT": write placeholder ciphertext to
        // the -o argument so the caller sees a real output file appear.
        `output=""\nwhile [ "$#" -gt 0 ]; do\n  if [ "$1" = "-o" ]; then output="$2"; fi\n  shift\ndone\n` +
        `printf 'fake-ciphertext' > "$output"\nexit 0\n`,
      "utf-8",
    );
    await chmod(ageStub, 0o755);

    const fixtureFile = join(scratch, "fixture.txt");
    await writeFile(fixtureFile, "content irrelevant to this test\n", "utf-8");
    const outputFile = join(scratch, "fixture.txt.enc");

    await execFileAsync(SCRIPT, [fixtureFile, outputFile], {
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH}`,
        AGE_RECIPIENT: "age1fakepublickeyusedonlybythistest0000000000000000000000000",
      },
    });

    const calls = (await readFile(logFile, "utf-8")).trim();
    expect(calls).toContain("-r age1fakepublickeyusedonlybythistest0000000000000000000000000");
    expect(calls).toContain(`-o ${outputFile}`);
    expect(calls).toContain(fixtureFile);
    await expect(readFile(outputFile, "utf-8")).resolves.toBe("fake-ciphertext");
  });

  it("uses the tool the operator configured, not whichever one happens to be installed", async () => {
    // Selecting by $PATH alone means an unrelated apt install that pulls in
    // `age` breaks every backup on a host deliberately configured for gpg:
    // AGE_RECIPIENT is unset there, so the run refuses. What is installed
    // is not a decision anyone made about this backup.
    const binDir = join(scratch, "bin");
    const logFile = join(scratch, "tool-calls.log");
    await mkdir(binDir, { recursive: true });

    for (const nombre of ["age", "gpg"]) {
      const stub = join(binDir, nombre);
      await writeFile(
        stub,
        `#!/usr/bin/env bash\necho "${nombre}" >> "${logFile}"\n` +
          `output=""\nwhile [ "$#" -gt 0 ]; do\n  if [ "$1" = "-o" ] || [ "$1" = "--output" ]; then output="$2"; fi\n  shift\ndone\n` +
          `printf 'fake-ciphertext' > "$output"\nexit 0\n`,
        "utf-8",
      );
      await chmod(stub, 0o755);
    }

    const fixtureFile = join(scratch, "fixture.txt");
    await writeFile(fixtureFile, "irrelevant\n", "utf-8");
    const outputFile = join(scratch, "fixture.txt.enc");

    await execFileAsync(SCRIPT, [fixtureFile, outputFile], {
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH}`,
        AGE_RECIPIENT: "",
        GPG_RECIPIENT: "DEADBEEFDEADBEEF",
      },
    });

    const calls = (await readFile(logFile, "utf-8")).trim().split("\n");
    expect(calls).toEqual(["gpg"]);
  });

  // --------------------------------------------------------------- guard

  it("refuses with a named error when the resolved tool's recipient variable is unset", async () => {
    const fixtureFile = join(scratch, "fixture.txt");
    await writeFile(fixtureFile, "irrelevant\n", "utf-8");
    const outputFile = join(scratch, "fixture.txt.enc");

    // No AGE_RECIPIENT, no GPG_RECIPIENT — age is not installed here, so
    // this exercises the gpg branch's guard.
    const error = await expectToFail(
      execFileAsync(SCRIPT, [fixtureFile, outputFile], {
        env: { ...process.env, GPG_RECIPIENT: undefined, AGE_RECIPIENT: undefined },
      }),
    );

    expect(error.code).toBe(1);
    expect(error.stderr).toMatch(/GPG_RECIPIENT/);
  });
});
