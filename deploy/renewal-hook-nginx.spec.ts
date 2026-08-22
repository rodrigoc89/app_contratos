import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

/**
 * Certbot's packaged systemd timer renews the certificate automatically,
 * but renewal alone does not make nginx pick up the new file — nginx keeps
 * serving whatever certificate it loaded into memory at its last reload
 * (design.md D6). This hook is installed at
 * `/etc/letsencrypt/renewal-hooks/deploy/10-reload-nginx.sh`
 * (`tls-bootstrap.sh`'s `[plan:renewal-hook]` step) and certbot runs every
 * executable under `renewal-hooks/deploy/` automatically after a
 * SUCCESSFUL renewal only — so the hook itself only needs `nginx -t &&
 * systemctl reload nginx`, exactly what these specs assert via mocked
 * `nginx`/`systemctl` binaries prepended onto $PATH. No real nginx or
 * systemd needed.
 */
const SCRIPT = join(import.meta.dirname, "renewal-hook-nginx.sh");

interface MockBin {
  binDir: string;
  logFile: string;
}

async function makeMockBin(
  scratch: string,
  opts: { nginxExit?: number; systemctlExit?: number } = {},
): Promise<MockBin> {
  const { nginxExit = 0, systemctlExit = 0 } = opts;
  const binDir = join(scratch, "bin");
  const logFile = join(scratch, "calls.log");
  await mkdir(binDir, { recursive: true });

  const nginxScript = join(binDir, "nginx");
  await writeFile(
    nginxScript,
    `#!/usr/bin/env bash\necho "nginx $*" >> "${logFile}"\nexit ${nginxExit}\n`,
    "utf-8",
  );
  await chmod(nginxScript, 0o755);

  const systemctlScript = join(binDir, "systemctl");
  await writeFile(
    systemctlScript,
    `#!/usr/bin/env bash\necho "systemctl $*" >> "${logFile}"\nexit ${systemctlExit}\n`,
    "utf-8",
  );
  await chmod(systemctlScript, 0o755);

  return { binDir, logFile };
}

describe("renewal-hook-nginx.sh", () => {
  let scratch: string;

  beforeEach(async () => {
    scratch = await mkdtemp(join(tmpdir(), "renewal-hook-nginx-spec-"));
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it("calls nginx -t then systemctl reload nginx, in that order, on a successful nginx -t", async () => {
    const { binDir, logFile } = await makeMockBin(scratch);

    await execFileAsync(SCRIPT, [], {
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
    });

    const calls = (await readFile(logFile, "utf-8")).trim().split("\n");
    expect(calls).toEqual(["nginx -t", "systemctl reload nginx"]);
  });

  it("does NOT call systemctl reload when nginx -t fails (&& short-circuits) and exits non-zero", async () => {
    const { binDir, logFile } = await makeMockBin(scratch, { nginxExit: 1 });

    await expect(
      execFileAsync(SCRIPT, [], {
        env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
      }),
    ).rejects.toMatchObject({ code: 1 });

    const calls = (await readFile(logFile, "utf-8")).trim().split("\n");
    expect(calls).toEqual(["nginx -t"]);
  });
});
