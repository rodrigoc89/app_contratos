import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

/**
 * `deploy.sh` is the single most dangerous script in `deploy/`: its real
 * (non-`--dry-run`) job is to stop the running production service. Every
 * guard below (git repository selection, commit state, required
 * configuration) MUST refuse before that stop happens — an outage for
 * nothing is worse than no deploy at all (design.md D5, threat matrix).
 *
 * These specs never touch a real service, a real database, or `/opt/contratos`
 * — everything is redirected into scratch temp directories, exactly like
 * `provision.spec.ts` (design.md D8). `--dry-run` still runs every guard for
 * real; only the mutating steps (stop/dump/checkout/install/migrate/seed/
 * publish/start) are replaced with a printed plan.
 */
const SCRIPT = join(import.meta.dirname, "deploy.sh");

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
  throw new Error("expected deploy.sh to exit with a non-zero status, but it succeeded");
}

describe("deploy.sh --dry-run", () => {
  let scratch: string;

  beforeEach(async () => {
    scratch = await mkdtemp(join(tmpdir(), "deploy-spec-"));
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  /**
   * A valid `$APP_DIR`: a real git checkout with a remote configured and a
   * clean worktree, so tests that target ONE specific guard do not
   * accidentally trip a different one.
   */
  async function makeValidAppDir(): Promise<string> {
    const appDir = join(scratch, "opt-contratos");
    await mkdir(appDir, { recursive: true });
    await execFileAsync("git", ["init", "--initial-branch=main"], { cwd: appDir });
    await execFileAsync("git", ["config", "user.email", "deploy-spec@example.invalid"], {
      cwd: appDir,
    });
    await execFileAsync("git", ["config", "user.name", "deploy.spec.ts"], { cwd: appDir });
    await execFileAsync(
      "git",
      ["remote", "add", "origin", "https://example.invalid/contratos.git"],
      { cwd: appDir },
    );
    await writeFile(join(appDir, "README.md"), "scratch checkout\n", "utf-8");
    await execFileAsync("git", ["add", "."], { cwd: appDir });
    await execFileAsync("git", ["commit", "-m", "initial commit"], { cwd: appDir });
    return appDir;
  }

  /** A valid `api.env`: `DATABASE_URL` and `JWT_SECRET` present, no `SEED_*`. */
  async function makeValidEnvFile(
    overrides: Record<string, string | undefined> = {},
  ): Promise<string> {
    const envFile = join(scratch, "api.env");
    const vars: Record<string, string | undefined> = {
      DATABASE_URL: "postgresql://user:pass@localhost:5432/contratos",
      JWT_SECRET: "a-fake-secret-at-least-32-characters-long",
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

  // ------------------------------------------------------------- task 5.1

  it("prints the deploy plan in stop → dump → checkout → install → migrate → seed → publish → start order", async () => {
    const appDir = await makeValidAppDir();
    const envFile = await makeValidEnvFile();

    const { stdout } = await execFileAsync(SCRIPT, ["--dry-run"], {
      env: { ...process.env, APP_DIR: appDir, ENV_FILE: envFile },
    });

    const steps = [
      "stop",
      "dump",
      "checkout",
      "install",
      "migrate",
      "seed",
      "publish",
      "start",
    ];
    const indices = steps.map((step) => stdout.indexOf(`[plan:${step}]`));

    steps.forEach((step, i) => {
      expect(indices[i], `missing [plan:${step}] marker in stdout`).toBeGreaterThanOrEqual(0);
    });
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1]!);
    }
  });

  it("seeds with NODE_ENV=production, without which every production gate in the seed is inert", async () => {
    // `prisma:seed` runs outside systemd, so it inherits nothing from
    // `EnvironmentFile=`. `load_env_file_into_environment` exports an
    // explicit whitelist, `run_as_service_user` passes an explicit
    // `--preserve-env` list, and `dotenv/config` in `prisma/seed.ts` reads
    // `apps/api/.env`, which does not exist on the server. So unless this
    // script states it, `process.env.NODE_ENV` is undefined there and every
    // `nodeEnv === "production"` guard in `seedDatabase.ts` silently does
    // nothing — including the one refusing to seed with the placeholder
    // signature, which has no later stage to catch it.
    //
    // deploy.sh only ever runs on the production host, so it asserts this
    // rather than reading it: a value taken from $ENV_FILE would be back to
    // failing open the moment an operator leaves the line out.
    const appDir = await makeValidAppDir();
    const envFile = await makeValidEnvFile();

    const { stdout } = await execFileAsync(SCRIPT, ["--dry-run"], {
      env: { ...process.env, APP_DIR: appDir, ENV_FILE: envFile },
    });

    expect(stdout).toContain("NODE_ENV=production pnpm prisma:seed");
  });

  // ------------------------------------------------------------- task 5.2

  it("refuses when $APP_DIR is not the git checkout it claims to be, even when cwd is a different repo (threat matrix: git repository selection)", async () => {
    const cwdRepo = join(scratch, "cwd-repo");
    await mkdir(cwdRepo, { recursive: true });
    await execFileAsync("git", ["init", "--initial-branch=main"], { cwd: cwdRepo });

    // Exists, but was never `git init`-ed — the exact "wrong path" shape:
    // deploy.sh must not fall back to operating on cwd's repo just because
    // one happens to exist.
    const appDir = join(scratch, "not-a-real-app-dir");
    await mkdir(appDir, { recursive: true });

    const error = await expectToFail(
      execFileAsync(SCRIPT, ["--dry-run"], {
        cwd: cwdRepo,
        env: { ...process.env, APP_DIR: appDir },
      }),
    );

    expect(error.code).toBe(1);
    expect(error.stderr).toMatch(/must run against \$APP_DIR.*not cwd/);
  });

  // ------------------------------------------------------------- task 5.3

  it("refuses to deploy over a dirty worktree, and never discards the uncommitted change (threat matrix: commit state)", async () => {
    const appDir = await makeValidAppDir();
    const envFile = await makeValidEnvFile();

    const trackedFile = join(appDir, "README.md");
    const dirtyContent = "a local edit that must survive a refused deploy\n";
    await writeFile(trackedFile, dirtyContent, "utf-8");

    const statusBefore = (
      await execFileAsync("git", ["status", "--porcelain"], { cwd: appDir })
    ).stdout;
    expect(statusBefore.trim()).not.toBe("");

    const error = await expectToFail(
      execFileAsync(SCRIPT, ["--dry-run"], {
        env: { ...process.env, APP_DIR: appDir, ENV_FILE: envFile },
      }),
    );

    expect(error.code).toBe(1);
    expect(error.stderr).toMatch(/uncommitted changes/);
    // The absence check the threat matrix asks for, not just the exit code:
    // the file content and `git status` are byte-identical to before the
    // refused run — deploy.sh never reached for `--force` or `reset --hard`.
    expect(error.stderr).not.toMatch(/--force/);
    expect(error.stderr).not.toMatch(/reset --hard/);
    await expect(readFile(trackedFile, "utf-8")).resolves.toBe(dirtyContent);
    const statusAfter = (
      await execFileAsync("git", ["status", "--porcelain"], { cwd: appDir })
    ).stdout;
    expect(statusAfter).toBe(statusBefore);
  });

  // ------------------------------------------------------------- task 5.4

  it("aborts before stopping the service when DATABASE_URL is missing, naming the variable", async () => {
    const appDir = await makeValidAppDir();
    const envFile = await makeValidEnvFile({ DATABASE_URL: undefined });

    const error = await expectToFail(
      execFileAsync(SCRIPT, ["--dry-run"], {
        env: { ...process.env, APP_DIR: appDir, ENV_FILE: envFile },
      }),
    );

    expect(error.code).toBe(1);
    expect(error.stderr).toContain("DATABASE_URL");
    expect(error.stdout).not.toContain("[plan:stop]");
  });

  it("aborts before stopping the service when JWT_SECRET is missing, naming the variable", async () => {
    const appDir = await makeValidAppDir();
    const envFile = await makeValidEnvFile({ JWT_SECRET: undefined });

    const error = await expectToFail(
      execFileAsync(SCRIPT, ["--dry-run"], {
        env: { ...process.env, APP_DIR: appDir, ENV_FILE: envFile },
      }),
    );

    expect(error.code).toBe(1);
    expect(error.stderr).toContain("JWT_SECRET");
    expect(error.stdout).not.toContain("[plan:stop]");
  });

  it("aborts before stopping the service when a seed password is missing on a first deploy (FIRST_DEPLOY=true), naming the variable", async () => {
    const appDir = await makeValidAppDir();
    // No SEED_* vars at all — the routine-redeploy shape (D3's regression
    // guard: passwords rotated out of the env file once the accounts exist).
    const envFile = await makeValidEnvFile();

    const error = await expectToFail(
      execFileAsync(SCRIPT, ["--dry-run"], {
        env: { ...process.env, APP_DIR: appDir, ENV_FILE: envFile, FIRST_DEPLOY: "true" },
      }),
    );

    expect(error.code).toBe(1);
    expect(error.stderr).toMatch(
      /SEED_ADMIN_PASSWORD|SEED_TECNICO_PASSWORD|SEED_OFICINA_PASSWORD|SEED_OFICINA2_PASSWORD/,
    );
    expect(error.stdout).not.toContain("[plan:stop]");
  });

  it("aborts before stopping the service when SEED_OFICINA_PASSWORD is missing on a first deploy (FIRST_DEPLOY=true), naming the variable", async () => {
    const appDir = await makeValidAppDir();
    // Admin and técnico passwords present — this test isolates the oficina
    // requirement specifically, so it must reach that check rather than
    // failing earlier on a sibling variable.
    const envFile = await makeValidEnvFile({
      SEED_ADMIN_PASSWORD: "a-fake-admin-password-12ch",
      SEED_TECNICO_PASSWORD: "a-fake-tecnico-password-12ch",
    });

    const error = await expectToFail(
      execFileAsync(SCRIPT, ["--dry-run"], {
        env: { ...process.env, APP_DIR: appDir, ENV_FILE: envFile, FIRST_DEPLOY: "true" },
      }),
    );

    expect(error.code).toBe(1);
    expect(error.stderr).toContain("SEED_OFICINA_PASSWORD");
    expect(error.stdout).not.toContain("[plan:stop]");
  });

  it("aborts before stopping the service when SEED_OFICINA2_PASSWORD is missing on a first deploy (FIRST_DEPLOY=true), naming the variable", async () => {
    const appDir = await makeValidAppDir();
    // Admin, técnico and oficina passwords present — isolates the oficina2
    // requirement specifically.
    const envFile = await makeValidEnvFile({
      SEED_ADMIN_PASSWORD: "a-fake-admin-password-12ch",
      SEED_TECNICO_PASSWORD: "a-fake-tecnico-password-12ch",
      SEED_OFICINA_PASSWORD: "a-fake-oficina-password-12ch",
    });

    const error = await expectToFail(
      execFileAsync(SCRIPT, ["--dry-run"], {
        env: { ...process.env, APP_DIR: appDir, ENV_FILE: envFile, FIRST_DEPLOY: "true" },
      }),
    );

    expect(error.code).toBe(1);
    expect(error.stderr).toContain("SEED_OFICINA2_PASSWORD");
    expect(error.stdout).not.toContain("[plan:stop]");
  });

  it("does NOT require seed passwords on a routine redeploy (FIRST_DEPLOY unset) — D3's regression guard stays satisfiable", async () => {
    const appDir = await makeValidAppDir();
    const envFile = await makeValidEnvFile();

    const { stdout } = await execFileAsync(SCRIPT, ["--dry-run"], {
      env: { ...process.env, APP_DIR: appDir, ENV_FILE: envFile },
    });

    expect(stdout).toContain("[plan:seed]");
  });

  // --------------------------------------------------------- housekeeping

  it("rejects an unrecognized flag instead of silently proceeding", async () => {
    const appDir = await makeValidAppDir();
    const envFile = await makeValidEnvFile();

    await expect(
      execFileAsync(SCRIPT, ["--not-a-real-flag"], {
        env: { ...process.env, APP_DIR: appDir, ENV_FILE: envFile },
      }),
    ).rejects.toMatchObject({ code: 1 });
  });
});
