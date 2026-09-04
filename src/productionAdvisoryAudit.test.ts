import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");
const temporaryDirectories: string[] = [];
const servers: Server[] = [];

async function runAudit(
  responseForType: (type: string) => unknown[],
): Promise<{ code: number | null; stdout: string; stderr: string; urls: URL[] }> {
  const directory = await mkdtemp(join(tmpdir(), "production-advisory-audit-"));
  temporaryDirectories.push(directory);
  const lockfile = join(directory, "package-lock.json");
  await writeFile(
    lockfile,
    JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": { dependencies: { runtime: "1.0.0" } },
        "node_modules/runtime": { version: "1.0.0" },
        "node_modules/dev-only": { version: "2.0.0", dev: true },
        "node_modules/@scope/runtime": { version: "3.0.0" },
        "node_modules/runtime/node_modules/nested": {
          version: "4.0.0",
          devOptional: true,
        },
      },
    }),
  );

  const urls: URL[] = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    urls.push(url);
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(responseForType(url.searchParams.get("type") ?? "")));
  });
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing test port");

  const child = spawn(
    process.execPath,
    [join(ROOT, "scripts/check-production-advisories.mjs"), lockfile],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        GITHUB_API_URL: `http://127.0.0.1:${address.port}`,
        GITHUB_TOKEN: "test-token",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
  child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
  const [code] = (await once(child, "close")) as [number | null];

  return { code, stdout, stderr, urls };
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolveClose) => server.close(() => resolveClose())),
    ),
  );
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("production advisory audit", () => {
  it("checks only production lockfile packages against reviewed and malware advisories", async () => {
    const result = await runAudit(() => []);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("3 production package versions checked");
    expect(result.urls.map((url) => url.searchParams.get("type")).sort()).toEqual([
      "malware",
      "reviewed",
    ]);
    for (const url of result.urls) {
      expect(url.pathname).toBe("/advisories");
      expect(url.searchParams.get("ecosystem")).toBe("npm");
      expect(url.searchParams.get("affects")?.split(",").sort()).toEqual([
        "@scope/runtime@3.0.0",
        "nested@4.0.0",
        "runtime@1.0.0",
      ]);
      expect(url.searchParams.get("affects")).not.toContain("dev-only");
    }
  });

  it("fails on medium-or-higher reviewed advisories", async () => {
    const result = await runAudit((type) =>
      type === "reviewed"
        ? [
            {
              ghsa_id: "GHSA-test-high",
              severity: "high",
              summary: "runtime vulnerability",
              html_url: "https://github.com/advisories/GHSA-test-high",
            },
          ]
        : [],
    );

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("GHSA-test-high");
    expect(result.stderr).toContain("runtime vulnerability");
  });

  it("fails on malware but does not block low-severity reviewed advisories", async () => {
    const result = await runAudit((type) =>
      type === "reviewed"
        ? [{ ghsa_id: "GHSA-test-low", severity: "low", summary: "low" }]
        : [{ ghsa_id: "GHSA-test-malware", severity: "critical", summary: "malware" }],
    );

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("GHSA-test-malware");
    expect(result.stderr).not.toContain("GHSA-test-low");
  });
});
