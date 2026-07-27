import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  selectRows: [] as Array<Array<Record<string, unknown>>>,
  insertedValues: [] as Array<Record<string, unknown>>,
  insertThrows: false,
}));

vi.mock("@/db", () => ({
  rawDb: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => mocks.selectRows.shift() ?? []),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(async (values: Record<string, unknown>) => {
        if (mocks.insertThrows) throw new Error("duplicate");
        mocks.insertedValues.push(values);
      }),
    })),
  })),
}));

import { recoverOrphanedKakaoAccount } from "./orphanedKakaoAccount";

const kakaoAccount = {
  type: "oauth",
  provider: "kakao",
  providerAccountId: "12345",
  access_token: "access-token",
};

describe("orphaned Kakao account recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectRows.length = 0;
    mocks.insertedValues.length = 0;
    mocks.insertThrows = false;
  });

  it("일반 이메일은 동일하더라도 자동 연결하지 않는다", async () => {
    await expect(
      recoverOrphanedKakaoAccount("player@example.com", kakaoAccount),
    ).resolves.toBe("not_applicable");

    expect(mocks.selectRows).toHaveLength(0);
    expect(mocks.insertedValues).toHaveLength(0);
  });

  it("provider id와 정확히 일치하는 완전한 고아 계정만 복구한다", async () => {
    mocks.selectRows.push(
      [{ id: "user-1" }],
      [],
      [],
      [],
    );

    await expect(
      recoverOrphanedKakaoAccount("kakao_12345@kakao.oauth", kakaoAccount),
    ).resolves.toBe("recovered");

    expect(mocks.insertedValues).toEqual([
      expect.objectContaining({
        userId: "user-1",
        provider: "kakao",
        providerAccountId: "12345",
        access_token: "access-token",
      }),
    ]);
  });

  it("같은 카카오 계정이 이미 같은 사용자에게 연결되어 있으면 성공으로 본다", async () => {
    mocks.selectRows.push([{ id: "user-1" }], [{ userId: "user-1" }]);

    await expect(
      recoverOrphanedKakaoAccount("kakao_12345@kakao.oauth", kakaoAccount),
    ).resolves.toBe("already_linked");
    expect(mocks.insertedValues).toHaveLength(0);
  });

  it("다른 사용자에게 연결된 카카오 계정은 이전하지 않는다", async () => {
    mocks.selectRows.push([{ id: "user-1" }], [{ userId: "user-2" }]);

    await expect(
      recoverOrphanedKakaoAccount("kakao_12345@kakao.oauth", kakaoAccount),
    ).resolves.toBe("conflict");
    expect(mocks.insertedValues).toHaveLength(0);
  });

  it("다른 OAuth 또는 비밀번호 인증이 있는 사용자는 자동 연결하지 않는다", async () => {
    mocks.selectRows.push(
      [{ id: "oauth-user" }],
      [],
      [{ provider: "google" }],
      [{ id: "password-user" }],
      [],
      [],
      [{ userId: "password-user" }],
    );

    await expect(
      recoverOrphanedKakaoAccount("kakao_12345@kakao.oauth", kakaoAccount),
    ).resolves.toBe("conflict");
    await expect(
      recoverOrphanedKakaoAccount("kakao_12345@kakao.oauth", kakaoAccount),
    ).resolves.toBe("conflict");
    expect(mocks.insertedValues).toHaveLength(0);
  });

  it("동시 요청이 같은 사용자의 연결을 먼저 만들면 성공으로 처리한다", async () => {
    mocks.selectRows.push(
      [{ id: "user-1" }],
      [],
      [],
      [],
      [{ userId: "user-1" }],
    );
    mocks.insertThrows = true;

    await expect(
      recoverOrphanedKakaoAccount("kakao_12345@kakao.oauth", kakaoAccount),
    ).resolves.toBe("already_linked");
  });
});
