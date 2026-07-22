import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consumedRows: [] as Array<
    Array<{ userId: string; provider: string; expiresAt: Date }>
  >,
  insertedValues: [] as Array<Record<string, unknown>>,
  linkedAccountValues: [] as Array<Record<string, unknown>>,
  existingAccountRows: [] as Array<Array<{ userId: string }>>,
  linkInsertThrows: false,
  deletedDuringCreate: 0,
  cookieHeader: "",
  jwt: null as { sub?: string } | null,
  getToken: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () =>
    new Headers(mocks.cookieHeader ? { cookie: mocks.cookieHeader } : {}),
  ),
}));

vi.mock("next-auth/jwt", () => ({
  getToken: mocks.getToken,
}));

vi.mock("@/db", () => {
  const tx = {
    delete: vi.fn(() => ({
      where: vi.fn(async () => {
        mocks.deletedDuringCreate += 1;
      }),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(async (values: Record<string, unknown>) => {
        mocks.insertedValues.push(values);
      }),
    })),
  };
  return {
    rawDb: vi.fn(() => ({
      transaction: vi.fn(async (callback: (value: typeof tx) => unknown) =>
        callback(tx),
      ),
      delete: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => mocks.consumedRows.shift() ?? []),
        })),
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => mocks.existingAccountRows.shift() ?? []),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(async (values: Record<string, unknown>) => {
          if (mocks.linkInsertThrows) throw new Error("duplicate");
          mocks.linkedAccountValues.push(values);
        }),
      })),
    })),
  };
});

import {
  ACCOUNT_LINK_INTENT_TTL_SECONDS,
  consumeAccountLinkIntent,
  createAccountLinkIntent,
  hashAccountLinkToken,
  isAccountLinkProvider,
  linkOAuthAccountForIntent,
  readCurrentAuthUserId,
} from "./accountLinkIntent";

const originalAuthSecret = process.env.AUTH_SECRET;

describe("account link intent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.consumedRows.length = 0;
    mocks.insertedValues.length = 0;
    mocks.linkedAccountValues.length = 0;
    mocks.existingAccountRows.length = 0;
    mocks.linkInsertThrows = false;
    mocks.deletedDuringCreate = 0;
    mocks.cookieHeader = "";
    mocks.jwt = null;
    mocks.getToken.mockImplementation(async () => mocks.jwt);
  });

  afterEach(() => {
    if (originalAuthSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = originalAuthSecret;
  });

  it("허용된 OAuth provider만 받아들인다", () => {
    expect(isAccountLinkProvider("google")).toBe(true);
    expect(isAccountLinkProvider("kakao")).toBe(true);
    expect(isAccountLinkProvider("credentials")).toBe(false);
    expect(isAccountLinkProvider(null)).toBe(false);
  });

  it("브라우저 원문 대신 SHA-256 hash와 만료 시각을 저장한다", async () => {
    const before = Date.now();
    const token = await createAccountLinkIntent("user-1", "google");
    const stored = mocks.insertedValues[0];

    expect(token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(stored).toMatchObject({
      userId: "user-1",
      provider: "google",
      tokenHash: hashAccountLinkToken(token),
    });
    expect(stored.tokenHash).not.toBe(token);
    expect((stored.expiresAt as Date).getTime()).toBeGreaterThanOrEqual(
      before + ACCOUNT_LINK_INTENT_TTL_SECONDS * 1_000,
    );
    expect(mocks.deletedDuringCreate).toBe(1);
  });

  it("현재 JWT 사용자와 provider가 모두 일치할 때 한 번만 소비한다", async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    mocks.consumedRows.push(
      [{ userId: "user-1", provider: "google", expiresAt }],
      [],
    );

    await expect(
      consumeAccountLinkIntent("raw-token", "google", "user-1"),
    ).resolves.toEqual({ userId: "user-1", provider: "google" });
    await expect(
      consumeAccountLinkIntent("raw-token", "google", "user-1"),
    ).resolves.toBeNull();
  });

  it("위조된 사용자·다른 provider·만료된 의도를 모두 거절한다", async () => {
    mocks.consumedRows.push(
      [{ userId: "victim", provider: "google", expiresAt: new Date(Date.now() + 60_000) }],
      [{ userId: "user-1", provider: "kakao", expiresAt: new Date(Date.now() + 60_000) }],
      [{ userId: "user-1", provider: "google", expiresAt: new Date(Date.now() - 1) }],
    );

    await expect(
      consumeAccountLinkIntent("one", "google", "attacker"),
    ).resolves.toBeNull();
    await expect(
      consumeAccountLinkIntent("two", "google", "user-1"),
    ).resolves.toBeNull();
    await expect(
      consumeAccountLinkIntent("three", "google", "user-1"),
    ).resolves.toBeNull();
  });

  it("현재 요청의 Auth.js JWT subject를 검증해 반환한다", async () => {
    process.env.AUTH_SECRET = "test-auth-secret-at-least-16";
    mocks.cookieHeader = "__Secure-authjs.session-token=encrypted";
    mocks.jwt = { sub: "user-1" };

    await expect(readCurrentAuthUserId()).resolves.toBe("user-1");
    expect(mocks.getToken).toHaveBeenCalledWith(
      expect.objectContaining({
        secret: "test-auth-secret-at-least-16",
        secureCookie: true,
      }),
    );
  });

  it("미연결 OAuth 계정만 의도의 사용자에게 새로 연결한다", async () => {
    mocks.existingAccountRows.push([]);
    await expect(
      linkOAuthAccountForIntent(
        { userId: "user-1", provider: "google" },
        {
          type: "oauth",
          provider: "google",
          providerAccountId: "google-account-1",
          access_token: "access-token",
        },
      ),
    ).resolves.toBe("linked");
    expect(mocks.linkedAccountValues).toEqual([
      expect.objectContaining({
        userId: "user-1",
        provider: "google",
        providerAccountId: "google-account-1",
      }),
    ]);
  });

  it("다른 사용자의 OAuth 계정은 이전하거나 덮어쓰지 않는다", async () => {
    mocks.existingAccountRows.push([{ userId: "victim" }]);
    await expect(
      linkOAuthAccountForIntent(
        { userId: "attacker", provider: "google" },
        {
          type: "oauth",
          provider: "google",
          providerAccountId: "victim-google",
        },
      ),
    ).resolves.toBe("account_in_use");
    expect(mocks.linkedAccountValues).toHaveLength(0);
  });

  it("provider 불일치와 경쟁 insert를 fail closed 처리한다", async () => {
    await expect(
      linkOAuthAccountForIntent(
        { userId: "user-1", provider: "google" },
        { type: "oauth", provider: "kakao", providerAccountId: "kakao-1" },
      ),
    ).resolves.toBe("failed");

    mocks.existingAccountRows.push([]);
    mocks.linkInsertThrows = true;
    await expect(
      linkOAuthAccountForIntent(
        { userId: "user-1", provider: "google" },
        { type: "oauth", provider: "google", providerAccountId: "google-1" },
      ),
    ).resolves.toBe("failed");
  });
});
