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
});
