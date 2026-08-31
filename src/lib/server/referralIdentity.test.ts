import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  backfillReferralIdentityClaims,
  hashReferralLoginIdentity,
  reserveReferralIdentityClaims,
} from "./referralIdentity";
import {
  accounts,
  passwordCredentials,
  referralRewardIdentities,
} from "@/db/schema";

const originalSecret = process.env.REFERRAL_IDENTITY_SECRET;

beforeEach(() => {
  process.env.REFERRAL_IDENTITY_SECRET = "test-referral-secret";
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env.REFERRAL_IDENTITY_SECRET;
  else process.env.REFERRAL_IDENTITY_SECRET = originalSecret;
});

describe("referral reward identities", () => {
  it("로그인 원문을 고정 형식의 keyed hash로 바꾼다", () => {
    expect(
      hashReferralLoginIdentity({
        kind: "oauth",
        provider: "kakao",
        providerAccountId: "12345",
      }),
    ).toBe("bf39eb14a34b40b41b91f4a26a846ad716045d7956f70908ea7a0c2b6a9ce2d8");
  });

  it("사용자 ID가 달라도 같은 로그인 주체는 두 번째 보상 선점을 거절한다", async () => {
    const ledger = new Set<string>();
    const first = fakeIdentityExecutor({
      ledger,
      oauthRows: [
        { provider: "kakao", providerAccountId: "same-kakao-account" },
      ],
    });
    const second = fakeIdentityExecutor({
      ledger,
      oauthRows: [
        { provider: "kakao", providerAccountId: "same-kakao-account" },
      ],
    });

    await expect(
      reserveReferralIdentityClaims(first as never, "old-user-id"),
    ).resolves.toBe(true);
    await expect(
      reserveReferralIdentityClaims(second as never, "new-user-id"),
    ).resolves.toBe(false);
    expect(ledger.size).toBe(1);
  });

  it("연결 계정 하나가 이미 사용됐으면 같은 요청의 부분 선점을 되돌린다", async () => {
    const existingHash = hashReferralLoginIdentity({
      kind: "oauth",
      provider: "kakao",
      providerAccountId: "used-kakao-account",
    });
    const ledger = new Set([existingHash]);
    const tx = fakeIdentityExecutor({
      ledger,
      oauthRows: [
        { provider: "google", providerAccountId: "fresh-google-account" },
        { provider: "kakao", providerAccountId: "used-kakao-account" },
      ],
    });

    await expect(
      reserveReferralIdentityClaims(tx as never, "new-user-id"),
    ).resolves.toBe(false);
    expect(ledger).toEqual(new Set([existingHash]));
  });

  it("HMAC 비밀키가 없으면 보상 선점을 실패 폐쇄한다", async () => {
    delete process.env.REFERRAL_IDENTITY_SECRET;
    const tx = fakeIdentityExecutor({
      ledger: new Set(),
      oauthRows: [{ provider: "kakao", providerAccountId: "account" }],
    });

    await expect(
      reserveReferralIdentityClaims(tx as never, "new-user-id"),
    ).rejects.toThrow("REFERRAL_IDENTITY_SECRET is required");
  });

  it("기존 참여자의 탈퇴 전에는 아직 없는 연결 로그인 식별자도 보강한다", async () => {
    const existingHash = hashReferralLoginIdentity({
      kind: "oauth",
      provider: "kakao",
      providerAccountId: "existing-account",
    });
    const freshHash = hashReferralLoginIdentity({
      kind: "oauth",
      provider: "google",
      providerAccountId: "linked-after-reward",
    });
    const ledger = new Set([existingHash]);
    const tx = fakeIdentityExecutor({
      ledger,
      oauthRows: [
        { provider: "kakao", providerAccountId: "existing-account" },
        { provider: "google", providerAccountId: "linked-after-reward" },
      ],
    });

    await backfillReferralIdentityClaims(tx as never, "legacy-user-id");

    expect(ledger).toEqual(new Set([existingHash, freshHash]));
  });
});

function fakeIdentityExecutor(args: {
  ledger: Set<string>;
  oauthRows: Array<{ provider: string; providerAccountId: string }>;
  credentialRows?: Array<{ normalizedLoginId: string }>;
}) {
  let insertedByLastAttempt: string[] = [];
  return {
    select: () => ({
      from: (table: unknown) => ({
        where: async () => {
          if (table === accounts) return args.oauthRows;
          if (table === passwordCredentials) return args.credentialRows ?? [];
          return [];
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (rows: Array<{ identityHash: string }>) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            if (table !== referralRewardIdentities) return [];
            insertedByLastAttempt = [];
            for (const row of rows) {
              if (args.ledger.has(row.identityHash)) continue;
              args.ledger.add(row.identityHash);
              insertedByLastAttempt.push(row.identityHash);
            }
            return insertedByLastAttempt.map((identityHash) => ({ identityHash }));
          },
        }),
      }),
    }),
    delete: (table: unknown) => ({
      where: async () => {
        if (table !== referralRewardIdentities) return;
        for (const identityHash of insertedByLastAttempt) {
          args.ledger.delete(identityHash);
        }
      },
    }),
  };
}
