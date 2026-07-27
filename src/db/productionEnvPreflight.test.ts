import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const scriptPath = fileURLToPath(
  new URL("../../scripts/check-production-env.mjs", import.meta.url),
);

describe("production environment preflight", () => {
  it("rejects an accidentally enabled staging environment before deployment", () => {
    const result = spawnSync(process.execPath, [scriptPath], {
      encoding: "utf8",
      env: { NODE_ENV: "production", IS_STAGING: "true" },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("production IS_STAGING must not be true");
  });

  it("rejects opening the paid coin shop before launch approval", () => {
    const result = spawnSync(process.execPath, [scriptPath], {
      encoding: "utf8",
      env: {
        NODE_ENV: "production",
        NEXT_PUBLIC_MUSEUN_COIN_SHOP_OPEN: "true",
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("production coin shop must remain closed");
  });

  it("rejects production account impersonation", () => {
    const result = spawnSync(process.execPath, [scriptPath], {
      encoding: "utf8",
      env: {
        NODE_ENV: "production",
        ADMIN_IMPERSONATION_ENABLED: "true",
        ALLOW_PRODUCTION_ADMIN_IMPERSONATION: "true",
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "production admin impersonation must remain disabled",
    );
  });

  it("requires an operations webhook for live deployments", () => {
    const result = spawnSync(process.execPath, [scriptPath], {
      encoding: "utf8",
      env: { NODE_ENV: "production" },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("OPS_ALERT_WEBHOOK_URL");
  });
});
