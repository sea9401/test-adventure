import { execFile } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("public release smoke", () => {
  it("새 점검 대문을 maintenance 상태로 승인한다", async () => {
    const server = createServer((request, response) => {
      if (request.url === "/api/health") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: true, db: "ok" }));
        return;
      }

      if (request.url === "/") {
        response.writeHead(503, { "content-type": "text/html; charset=utf-8" });
        response.end("<p>점검 중에는 게임에 접속할 수 없습니다.</p>");
        return;
      }

      response.writeHead(404);
      response.end();
    });

    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    try {
      const address = server.address() as AddressInfo;
      const result = await execFileAsync(
        process.execPath,
        ["scripts/check-public-release.mjs"],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            PUBLIC_RELEASE_BASE_URL: `http://127.0.0.1:${address.port}`,
            PUBLIC_RELEASE_MAINTENANCE_POLICY: "require",
            PUBLIC_RELEASE_RETRIES: "1",
            OPS_ALERT_WEBHOOK_URL: "",
          },
        },
      );

      expect(result.stdout).toContain("PUBLIC RELEASE MAINTENANCE PASS");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
