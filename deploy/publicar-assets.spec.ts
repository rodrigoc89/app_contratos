import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

/**
 * `publicar-assets.sh` publishes a `vite build` output onto the server:
 * additive asset copy, then an atomic swap of `index.html`, then `sw.js`
 * LAST (design.md D4). It is independently testable from `deploy.sh` — that
 * script's own `[plan:publish]` line only names this one by path and never
 * requires it to exist (design.md, PR5 re-slicing note 3).
 *
 * These specs never touch a real `/var/www/contratos` — everything is
 * redirected into scratch temp directories via `BUILD_DIR`/`WEB_ROOT`,
 * exactly like `provision.spec.ts` and `deploy.spec.ts` (design.md D8).
 */
const SCRIPT = join(import.meta.dirname, "publicar-assets.sh");

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
  throw new Error(
    "expected publicar-assets.sh to exit with a non-zero status, but it succeeded",
  );
}

describe("publicar-assets.sh", () => {
  let scratch: string;
  let buildDir: string;
  let webRoot: string;

  beforeEach(async () => {
    scratch = await mkdtemp(join(tmpdir(), "publicar-assets-spec-"));
    buildDir = join(scratch, "dist");
    webRoot = join(scratch, "var-www-contratos");
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  /**
   * A minimal, realistic `vite build` output: one content-hashed JS bundle,
   * `manifest.webmanifest`, an icon, `index.html`, and `sw.js`. `content`
   * overrides let a test give `index.html`/`sw.js` distinguishable bytes so
   * a real run's swap can be asserted on content, not just on exit code.
   */
  async function makeBuildDir(
    overrides: { indexHtml?: string; swJs?: string } = {},
  ): Promise<string> {
    await mkdir(join(buildDir, "assets"), { recursive: true });
    await mkdir(join(buildDir, "icons"), { recursive: true });
    await writeFile(
      join(buildDir, "assets", "index-abc123.js"),
      "console.log('hashed bundle');\n",
      "utf-8",
    );
    await writeFile(join(buildDir, "icons", "icon-192.png"), "fake-png-bytes", "utf-8");
    await writeFile(join(buildDir, "manifest.webmanifest"), '{"name":"Contratos"}', "utf-8");
    await writeFile(
      join(buildDir, "index.html"),
      overrides.indexHtml ?? "<html>new shell</html>\n",
      "utf-8",
    );
    await writeFile(join(buildDir, "sw.js"), overrides.swJs ?? "// new service worker\n", "utf-8");
    return buildDir;
  }

  // ------------------------------------------------------------- task 5.6

  it("prints the publish plan in copy-assets → swap-index → swap-sw order", async () => {
    await makeBuildDir();

    const { stdout } = await execFileAsync(SCRIPT, ["--dry-run"], {
      env: { ...process.env, BUILD_DIR: buildDir, WEB_ROOT: webRoot },
    });

    const steps = ["copy-assets", "swap-index", "swap-sw"];
    const indices = steps.map((step) => stdout.indexOf(`[plan:${step}]`));

    steps.forEach((step, i) => {
      expect(indices[i], `missing [plan:${step}] marker in stdout`).toBeGreaterThanOrEqual(0);
    });
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1]!);
    }
  });

  // --------------------------------------------------------------- 5.8 GREEN

  it("additively copies hashed assets, then publishes index.html and sw.js with the new build's content", async () => {
    await makeBuildDir({
      indexHtml: "<html>release A shell</html>\n",
      swJs: "// release A worker\n",
    });

    await execFileAsync(SCRIPT, [], {
      env: { ...process.env, BUILD_DIR: buildDir, WEB_ROOT: webRoot },
    });

    await expect(
      readFile(join(webRoot, "assets", "index-abc123.js"), "utf-8"),
    ).resolves.toContain("hashed bundle");
    await expect(readFile(join(webRoot, "icons", "icon-192.png"), "utf-8")).resolves.toBe(
      "fake-png-bytes",
    );
    await expect(readFile(join(webRoot, "manifest.webmanifest"), "utf-8")).resolves.toContain(
      "Contratos",
    );
    await expect(readFile(join(webRoot, "index.html"), "utf-8")).resolves.toBe(
      "<html>release A shell</html>\n",
    );
    await expect(readFile(join(webRoot, "sw.js"), "utf-8")).resolves.toBe(
      "// release A worker\n",
    );
  });

  it("never removes a previously published asset it did not overwrite (additive, never --delete)", async () => {
    await mkdir(join(webRoot, "assets"), { recursive: true });
    await writeFile(
      join(webRoot, "assets", "index-oldhash.js"),
      "console.log('previous release, still referenced by an open tab');\n",
      "utf-8",
    );
    await makeBuildDir();

    await execFileAsync(SCRIPT, [], {
      env: { ...process.env, BUILD_DIR: buildDir, WEB_ROOT: webRoot },
    });

    await expect(
      readFile(join(webRoot, "assets", "index-oldhash.js"), "utf-8"),
    ).resolves.toContain("previous release");
  });

  // ------------------------------------------------------------- task 5.7

  it("keeps all release manifests when at most 2 are present (no prune yet)", async () => {
    await makeBuildDir();
    const releasesDir = join(webRoot, ".releases");
    await mkdir(releasesDir, { recursive: true });
    await writeFile(join(releasesDir, "20200101T000000Z.files"), "index.html\nsw.js\n", "utf-8");

    await execFileAsync(SCRIPT, [], {
      env: { ...process.env, BUILD_DIR: buildDir, WEB_ROOT: webRoot },
    });

    const manifests = (await readdir(releasesDir)).filter((f) => f.endsWith(".files"));
    // The pre-seeded one plus this run's own — exactly 2, nothing pruned.
    expect(manifests).toHaveLength(2);
    expect(manifests).toContain("20200101T000000Z.files");
  });

  it("retains only the 2 newest release manifests when 3+ are present, pruning older manifests and the assets referenced only by them", async () => {
    await makeBuildDir();
    const releasesDir = join(webRoot, ".releases");
    const assetsDir = join(webRoot, "assets");
    await mkdir(assetsDir, { recursive: true });
    await mkdir(releasesDir, { recursive: true });

    // Three prior releases, oldest to newest. Each references a unique
    // asset that ONLY it lists — the exact orphan-pruning shape — plus
    // index.html/sw.js, which every release lists and must survive.
    const priorReleases = [
      { timestamp: "20200101T000000Z", uniqueAsset: "index-old1.js" },
      { timestamp: "20200601T000000Z", uniqueAsset: "index-old2.js" },
      { timestamp: "20201201T000000Z", uniqueAsset: "index-old3.js" },
    ];
    for (const release of priorReleases) {
      await writeFile(
        join(assetsDir, release.uniqueAsset),
        `orphan candidate from ${release.timestamp}\n`,
        "utf-8",
      );
      await writeFile(
        join(releasesDir, `${release.timestamp}.files`),
        `assets/${release.uniqueAsset}\nindex.html\nsw.js\n`,
        "utf-8",
      );
    }

    await execFileAsync(SCRIPT, [], {
      env: { ...process.env, BUILD_DIR: buildDir, WEB_ROOT: webRoot },
    });

    const manifests = (await readdir(releasesDir)).filter((f) => f.endsWith(".files"));
    // 3 prior + 1 just written = 4 → retain the 2 newest only: the newest
    // prior release (20201201T000000Z) and this run's own.
    expect(manifests).toHaveLength(2);
    expect(manifests).toContain("20201201T000000Z.files");
    expect(manifests).not.toContain("20200101T000000Z.files");
    expect(manifests).not.toContain("20200601T000000Z.files");

    // The two oldest releases' unique assets are gone (no retained manifest
    // lists them); the newest prior release's own unique asset survives,
    // since that manifest is one of the 2 retained.
    await expect(readFile(join(assetsDir, "index-old1.js"), "utf-8")).rejects.toThrow();
    await expect(readFile(join(assetsDir, "index-old2.js"), "utf-8")).rejects.toThrow();
    await expect(readFile(join(assetsDir, "index-old3.js"), "utf-8")).resolves.toContain(
      "orphan candidate",
    );
  });

  // --------------------------------------------------------- housekeeping

  it("refuses when $BUILD_DIR has no vite build output yet", async () => {
    const error = await expectToFail(
      execFileAsync(SCRIPT, ["--dry-run"], {
        env: { ...process.env, BUILD_DIR: buildDir, WEB_ROOT: webRoot },
      }),
    );

    expect(error.code).toBe(1);
    expect(error.stderr).toMatch(/build directory/);
  });

  it("rejects an unrecognized flag instead of silently proceeding", async () => {
    await makeBuildDir();

    await expect(
      execFileAsync(SCRIPT, ["--not-a-real-flag"], {
        env: { ...process.env, BUILD_DIR: buildDir, WEB_ROOT: webRoot },
      }),
    ).rejects.toMatchObject({ code: 1 });
  });
});
