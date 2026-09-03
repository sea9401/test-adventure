import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(async () => ({
    user: { id: "admin", email: "admin@example.com" },
  })),
  impersonation: vi.fn(async () => null as { targetUserId: string } | null),
  selectRows: [] as unknown[][],
  deviceSessionId: "device-a" as string | undefined,
  ageEligible: true,
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/server/adminImpersonation", () => ({
  readAdminImpersonationFor: mocks.impersonation,
}));
vi.mock("@/lib/server/ageEligibility", () => ({
  hasValidAgeEligibilityCookie: vi.fn(async () => mocks.ageEligible),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(() =>
      mocks.deviceSessionId
        ? { name: "game-device-session.v1", value: mocks.deviceSessionId }
        : undefined,
    ),
  })),
}));
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => mocks.selectRows.shift() ?? []),
        })),
      })),
    })),
  },
}));

import { ensureOriginalUser, ensureUser } from "./ensureUser";

describe("ensureUser impersonation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectRows.length = 0;
    mocks.impersonation.mockResolvedValue(null);
    mocks.deviceSessionId = "device-a";
    mocks.ageEligible = true;
  });

  it("가장이 없으면 원래 로그인 유저를 반환한다", async () => {
    mocks.selectRows.push([
      { id: "admin", bannedUntil: null, activeSessionId: "device-a" },
    ]);
    await expect(ensureUser()).resolves.toBe("admin");
  });

  it("DB에서 삭제된 사용자는 유효한 옛 JWT로 다시 만들지 않는다", async () => {
    mocks.selectRows.push([]);
    await expect(ensureOriginalUser()).resolves.toBeNull();
  });

  it("연령 확인이 없으면 유효한 로그인 세션도 게임 API 사용자로 인정하지 않는다", async () => {
    mocks.ageEligible = false;

    await expect(ensureOriginalUser()).resolves.toBeNull();
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it("유효한 가장 세션은 게임 사용자만 대상으로 전환한다", async () => {
    mocks.impersonation.mockResolvedValue({ targetUserId: "target" });
    mocks.selectRows.push(
      [{ id: "admin", bannedUntil: null, activeSessionId: "device-a" }],
      [{ id: "target" }],
    );
    await expect(ensureUser()).resolves.toBe("target");

    mocks.selectRows.push([
      { id: "admin", bannedUntil: null, activeSessionId: "device-a" },
    ]);
    await expect(ensureOriginalUser()).resolves.toBe("admin");
  });

  it("대상이 삭제되면 관리자 계정으로 폴백하지 않는다", async () => {
    mocks.impersonation.mockResolvedValue({ targetUserId: "deleted" });
    mocks.selectRows.push(
      [{ id: "admin", bannedUntil: null, activeSessionId: "device-a" }],
      [],
    );
    await expect(ensureUser()).resolves.toBeNull();
  });

  it("활성 기기 쿠키가 다르면 일반 게임 API 사용자 확인을 거부한다", async () => {
    mocks.deviceSessionId = "device-old";
    mocks.selectRows.push([
      { id: "admin", bannedUntil: null, activeSessionId: "device-new" },
    ]);
    await expect(ensureUser()).resolves.toBeNull();
  });

  it("명시적 410 처리가 필요한 라우트는 기기 검사를 건너뛸 수 있다", async () => {
    mocks.deviceSessionId = undefined;
    mocks.selectRows.push([
      { id: "admin", bannedUntil: null, activeSessionId: "device-new" },
    ]);
    await expect(ensureUser({ skipDeviceCheck: true })).resolves.toBe("admin");
  });
});
