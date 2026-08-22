import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

/**
 * `tls-bootstrap.sh` implements design.md D6: nginx must never end a run
 * unable to start. `deploy/nginx.conf` ships as a template
 * (`__CONTRATOS_HOST__`, `__WEB_ROOT__` — task 6.1); this script renders it,
 * refuses to touch nginx at all if a placeholder token survives that render
 * (task 6.2), and only ever installs the full rendered conf AFTER certbot
 * has obtained a certificate — the HTTP-only bootstrap conf and its own
 * `nginx -t` are what nginx serves before that (task 6.3).
 *
 * Real nginx/certbot/systemd steps need root and a real host — untestable
 * here, exactly like `deploy.sh`'s real (non `--dry-run`) steps (design.md
 * D8). These specs only exercise the guards that run unconditionally (the
 * render + placeholder check, which need no root) and the `--dry-run` plan.
 */
const SCRIPT = join(import.meta.dirname, "tls-bootstrap.sh");
const REAL_NGINX_CONF_TEMPLATE = join(import.meta.dirname, "nginx.conf");

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
  throw new Error("expected tls-bootstrap.sh to exit with a non-zero status, but it succeeded");
}

describe("tls-bootstrap.sh", () => {
  let scratch: string;

  beforeEach(async () => {
    scratch = await mkdtemp(join(tmpdir(), "tls-bootstrap-spec-"));
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  // ------------------------------------------------------------- task 6.2

  it("refuses (non-zero exit) before touching nginx when the rendered conf still contains a literal placeholder token", async () => {
    // A template carrying a placeholder the render step does not know how
    // to substitute — simulates template drift, not merely a missing env
    // var: even with CONTRATOS_HOST/WEB_ROOT both set, an unresolved token
    // must still be caught structurally.
    const driftedTemplate = join(scratch, "nginx.conf");
    await writeFile(
      driftedTemplate,
      "server_name __CONTRATOS_HOST__;\n" +
        "root __WEB_ROOT__;\n" +
        "ssl_certificate /etc/letsencrypt/live/__SOME_NEW_TOKEN__/fullchain.pem;\n",
      "utf-8",
    );

    const error = await expectToFail(
      execFileAsync(SCRIPT, ["--dry-run"], {
        env: {
          ...process.env,
          CONTRATOS_HOST: "contratos.example.com",
          WEB_ROOT: "/var/www/contratos",
          NGINX_CONF_TEMPLATE: driftedTemplate,
        },
      }),
    );

    expect(error.code).toBe(1);
    expect(error.stderr).toMatch(/placeholder/);
    expect(error.stderr).toContain("__SOME_NEW_TOKEN__");
    // The guard runs before print_plan() is ever reached — proves the
    // refusal happens before ANY nginx step, planned or real.
    expect(error.stdout).not.toMatch(/\[plan:/);
  });

  it("refuses (non-zero exit) before touching nginx when $CONTRATOS_HOST is unset", async () => {
    const error = await expectToFail(
      execFileAsync(SCRIPT, ["--dry-run"], {
        env: { ...process.env, CONTRATOS_HOST: "", WEB_ROOT: "/var/www/contratos" },
      }),
    );

    expect(error.code).toBe(1);
    expect(error.stderr).toMatch(/CONTRATOS_HOST/);
    expect(error.stdout).not.toMatch(/\[plan:/);
  });

  // ------------------------------------------------------------- task 6.3

  it("plans the HTTP-only bootstrap conf and nginx -t BEFORE certbot certonly, and the full nginx.conf template is not installed until after the certificate exists", async () => {
    const { stdout } = await execFileAsync(SCRIPT, ["--dry-run"], {
      env: {
        ...process.env,
        CONTRATOS_HOST: "contratos.example.com",
        WEB_ROOT: "/var/www/contratos",
        NGINX_CONF_TEMPLATE: REAL_NGINX_CONF_TEMPLATE,
      },
    });

    const markers = [
      "[plan:bootstrap-install]",
      "[plan:bootstrap-test]",
      "[plan:certbot]",
      "[plan:full-install]",
    ];
    const indices = markers.map((marker) => stdout.indexOf(marker));

    markers.forEach((marker, i) => {
      expect(indices[i], `missing plan marker '${marker}' in stdout`).toBeGreaterThanOrEqual(0);
    });
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1]!);
    }
  });

  it("installs certbot alongside nginx, since nothing else in deploy/ ever does", async () => {
    // provision.sh does not install it and no other script in the chain
    // does either, so without this the run gets as far as installing the
    // bootstrap conf and reloading nginx, then dies on `certbot: command
    // not found` — inside the one script whose entire job is breaking a
    // chicken-and-egg. The packaged certbot is also what brings the systemd
    // renewal timer the README's renewal section relies on.
    const { stdout } = await execFileAsync(SCRIPT, ["--dry-run"], {
      env: { ...process.env, CONTRATOS_HOST: "contratos.example.invalid" },
    });

    const planDeInstalacion = stdout
      .split("\n")
      .find((linea) => linea.includes("[plan:install-nginx]"));

    expect(planDeInstalacion).toContain("certbot");
  });

  it("refuses when $CERTBOT_WEBROOT disagrees with the path the bootstrap conf serves", async () => {
    // The bootstrap conf hardcodes the ACME `root` and is installed as-is,
    // never rendered — so overriding CERTBOT_WEBROOT alone would have
    // certbot write the challenge into one directory while nginx serves the
    // challenge location from another, and validation would 404 with the
    // two paths looking individually correct.
    const error = await expectToFail(
      execFileAsync(SCRIPT, ["--dry-run"], {
        env: {
          ...process.env,
          CONTRATOS_HOST: "contratos.example.invalid",
          CERTBOT_WEBROOT: "/srv/acme-challenge",
        },
      }),
    );

    expect(error.code).toBe(1);
    expect(error.stderr).toContain("/srv/acme-challenge");
    expect(error.stderr).toContain("/var/www/certbot");
  });

  it("renders successfully against the real deploy/nginx.conf template with no leftover placeholder", async () => {
    const { stdout } = await execFileAsync(SCRIPT, ["--dry-run"], {
      env: {
        ...process.env,
        CONTRATOS_HOST: "contratos.example.com",
        WEB_ROOT: "/var/www/contratos",
        NGINX_CONF_TEMPLATE: REAL_NGINX_CONF_TEMPLATE,
      },
    });

    expect(stdout).toContain("[plan:render-check]");
  });

  // --------------------------------------------------------- housekeeping

  it("rejects an unrecognized flag instead of silently proceeding", async () => {
    await expect(
      execFileAsync(SCRIPT, ["--not-a-real-flag"], {
        env: {
          ...process.env,
          CONTRATOS_HOST: "contratos.example.com",
          WEB_ROOT: "/var/www/contratos",
        },
      }),
    ).rejects.toMatchObject({ code: 1 });
  });
});
