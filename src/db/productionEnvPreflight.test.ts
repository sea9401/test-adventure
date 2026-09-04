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

  it("rejects homepage review mode without a complete public merchant disclosure", () => {
    const result = spawnSync(process.execPath, [scriptPath], {
      encoding: "utf8",
      env: {
        NODE_ENV: "production",
        PG_HOMEPAGE_REVIEW_MODE: "true",
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "homepage review merchant env missing: PUBLIC_MERCHANT_REPRESENTATIVE, PUBLIC_MERCHANT_ADDRESS, PUBLIC_MERCHANT_CONTACT",
    );
  });

  it("rejects homepage review mode unless Toss test payment and review login are configured", () => {
    const result = spawnSync(process.execPath, [scriptPath], {
      encoding: "utf8",
      env: {
        NODE_ENV: "production",
        PG_HOMEPAGE_REVIEW_MODE: "true",
        PUBLIC_MERCHANT_REPRESENTATIVE: "홍길동",
        PUBLIC_MERCHANT_ADDRESS: "서울특별시 테스트구 테스트로 1",
        PUBLIC_MERCHANT_CONTACT: "02-0000-0000",
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "homepage review requires MUSEUN_COIN_PAYMENTS_MODE=test",
    );
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

  it("allows live deployments without an operations webhook", () => {
    const result = spawnSync(process.execPath, [scriptPath], {
      encoding: "utf8",
      env: { NODE_ENV: "production" },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).not.toContain("OPS_ALERT_WEBHOOK_URL");
  });

  it("홍보 중복 방지 HMAC 비밀키가 없으면 운영 배포를 거절한다", () => {
    const result = spawnSync(process.execPath, [scriptPath], {
      encoding: "utf8",
      env: { NODE_ENV: "production" },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("REFERRAL_IDENTITY_SECRET");
  });
});
