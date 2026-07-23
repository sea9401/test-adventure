import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: null as {
    user: { id: string; email?: string | null };
  } | null,
}));

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => mocks.session),
}));

import {
  currentAdminCapabilities,
  currentAdminRole,
  getAdminRoleConfigSummary,
  requireAdmin,
  requireAdminRole,
} from "./isAdmin";

const envKeys = [
  "ADMIN_EMAILS",
  "OPS_REWARD_EMAILS",
  "OPS_SANCTION_EMAILS",
  "OPS_READONLY_EMAILS",
] as const;
const originalEnv = Object.fromEntries(
  envKeys.map((key) => [key, process.env[key]]),
) as Record<(typeof envKeys)[number], string | undefined>;

describe("관리자 이메일 역할 게이트", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session = null;
    for (const key of envKeys) delete process.env[key];
  });

  afterAll(() => {
    for (const key of envKeys) {
      const value = originalEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("비로그인은 401, 일반 로그인 사용자는 403으로 구분한다", async () => {
    await expect(requireAdmin()).resolves.toMatchObject({ status: 401 });

    mocks.session = { user: { id: "user-1", email: "user@example.com" } };
    await expect(requireAdmin()).resolves.toMatchObject({ status: 403 });
    await expect(currentAdminRole()).resolves.toBeNull();
  });

  it("최고 관리자는 이메일 대소문자와 공백에 무관하게 모든 권한을 가진다", async () => {
    process.env.ADMIN_EMAILS = " admin@example.com, SECOND@example.com ";
    mocks.session = { user: { id: "admin-1", email: "ADMIN@example.com" } };

    await expect(requireAdmin()).resolves.toBeNull();
    await expect(currentAdminRole()).resolves.toBe("super");
    await expect(currentAdminCapabilities()).resolves.toEqual({
      read: true,
      reward: true,
      sanction: true,
      super: true,
    });
    expect(getAdminRoleConfigSummary()).toEqual({
      super: 2,
      reward: 0,
      sanction: 0,
      readonly: 0,
    });
  });

  it("세부 역할은 허용된 작업만 열고 최고 관리자 작업은 거절한다", async () => {
    process.env.OPS_REWARD_EMAILS = "operator@example.com";
    mocks.session = {
      user: { id: "operator-1", email: "operator@example.com" },
    };

    await expect(currentAdminRole()).resolves.toBe("reward");
    await expect(currentAdminCapabilities()).resolves.toEqual({
      read: true,
      reward: true,
      sanction: false,
      super: false,
    });
    await expect(requireAdminRole("readonly")).resolves.toBeNull();
    await expect(requireAdminRole("reward")).resolves.toBeNull();
    await expect(requireAdminRole("sanction")).resolves.toMatchObject({
      status: 403,
    });
    await expect(requireAdminRole("super")).resolves.toMatchObject({
      status: 403,
    });
  });
});
