import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));
vi.mock("@/lib/server/isAdmin", () => ({
  isSuperAdminEmail: vi.fn(() => true),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: vi.fn(), set: vi.fn() })),
}));
import {
  ADMIN_IMPERSONATION_TTL_SECONDS,
  decodeAdminImpersonation,
  encodeAdminImpersonation,
  isAdminImpersonationEnabled,
  type AdminImpersonation,
} from "./adminImpersonation";

const originalEnv = {
  AUTH_SECRET: process.env.AUTH_SECRET,
  IS_STAGING: process.env.IS_STAGING,
  ADMIN_IMPERSONATION_ENABLED: process.env.ADMIN_IMPERSONATION_ENABLED,
  ALLOW_PRODUCTION_ADMIN_IMPERSONATION:
    process.env.ALLOW_PRODUCTION_ADMIN_IMPERSONATION,
  NODE_ENV: process.env.NODE_ENV,
};

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("admin impersonation token", () => {
  const now = 1_000_000;
  const value: AdminImpersonation = {
    adminId: "admin",
    targetUserId: "target",
    issuedAt: now,
    expiresAt: now + ADMIN_IMPERSONATION_TTL_SECONDS * 1_000,
  };

  it("서명된 토큰만 원본 값으로 복원한다", () => {
    const token = encodeAdminImpersonation(value, "test-secret-at-least-16");
    expect(
      decodeAdminImpersonation(token, "test-secret-at-least-16", now),
    ).toEqual(value);
    expect(decodeAdminImpersonation(token, "different-secret-123", now)).toBeNull();
  });

  it("변조·만료·과도한 유효기간 토큰을 거절한다", () => {
    const token = encodeAdminImpersonation(value, "test-secret-at-least-16");
    const [payload, sig] = token.split(".");
    expect(
      decodeAdminImpersonation(`${payload}x.${sig}`, "test-secret-at-least-16", now),
    ).toBeNull();
    expect(
      decodeAdminImpersonation(
        token,
        "test-secret-at-least-16",
        value.expiresAt,
      ),
    ).toBeNull();
    expect(
      decodeAdminImpersonation(
        encodeAdminImpersonation(
          { ...value, expiresAt: value.expiresAt + 120_000 },
          "test-secret-at-least-16",
        ),
        "test-secret-at-least-16",
        now,
      ),
    ).toBeNull();
  });
});

describe("admin impersonation environment gate", () => {
  it("스테이징은 AUTH_SECRET 있으면 자동 활성화한다", () => {
    process.env.AUTH_SECRET = "test-secret-at-least-16";
    process.env.IS_STAGING = "true";
    process.env.NODE_ENV = "production";
    expect(isAdminImpersonationEnabled()).toBe(true);
  });

  it("운영은 두 가지 명시적 허용이 모두 필요하다", () => {
    process.env.AUTH_SECRET = "test-secret-at-least-16";
    process.env.IS_STAGING = "false";
    process.env.NODE_ENV = "production";
    process.env.ADMIN_IMPERSONATION_ENABLED = "true";
    process.env.ALLOW_PRODUCTION_ADMIN_IMPERSONATION = "false";
    expect(isAdminImpersonationEnabled()).toBe(false);
    process.env.ALLOW_PRODUCTION_ADMIN_IMPERSONATION = "true";
    expect(isAdminImpersonationEnabled()).toBe(true);
  });
});
