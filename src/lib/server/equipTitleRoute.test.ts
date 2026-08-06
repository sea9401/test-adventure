// 칭호 장착 라우트 통합 테스트 — POST /api/v2/me/equip-title.
// adventure-log.v2(보유)·character.v2(장착) 를 stateful 모킹해 ① 미보유 거부
// ② 미존재 칭호 거부 ③ 보유 칭호 장착 ④ null 해제 를 검증한다.
//
// 보유 검증은 db.select(adventure-log.v2) 비잠금 읽기, 쓰기는 tx + lockSaveForUpdate.

import { beforeEach, describe, expect, it, vi } from "vitest";

const { store, account } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  account: { email: "player@example.com" },
}));
const k = (u: string, key: string) => `${u}::${key}`;

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async (): Promise<string | null> => "u1"),
}));
// db.select(...).from(...).where(...).limit(...) → adventure-log.v2 row 반환.
// db.transaction(cb) → cb({}) (tx 미사용, lockSaveForUpdate/upsertSave 가 모킹됨).
vi.mock("@/db", () => ({
  db: {
    select: vi.fn((fields: Record<string, unknown>) => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            if ("email" in fields) return [{ email: account.email }];
            const v = store.get(k("u1", "adventure-log.v2"));
            return v === undefined ? [] : [{ value: v }];
          },
        }),
      }),
    })),
    transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({})),
  },
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(
    async (_tx: unknown, u: string, key: string, fb: unknown) =>
      store.has(k(u, key)) ? store.get(k(u, key)) : fb,
  ),
  upsertSave: vi.fn(
    async (_tx: unknown, u: string, key: string, v: unknown) => {
      store.set(k(u, key), v);
    },
  ),
}));

import { POST } from "@/app/api/v2/me/equip-title/route";
import { ensureUser } from "@/lib/server/ensureUser";
import { GM_TITLE_ID, TITLES } from "@/adventure/data/titles";

const OWNED = Object.keys(TITLES)[0]; // 카탈로그의 임의 실재 칭호 1개.
const equipped = () =>
  (store.get(k("u1", "character.v2")) as { equippedTitleId?: unknown })
    ?.equippedTitleId ?? null;
const post = (titleId: unknown) =>
  POST(
    new Request("http://t/api/v2/me/equip-title", {
      method: "POST",
      body: JSON.stringify({ titleId }),
    }),
  );

describe("POST /api/v2/me/equip-title", () => {
  beforeEach(() => {
    store.clear();
    account.email = "player@example.com";
    vi.mocked(ensureUser).mockResolvedValue("u1");
    store.set(k("u1", "character.v2"), { level: 5, equippedTitleId: null });
    store.set(k("u1", "adventure-log.v2"), {
      titles: { [OWNED]: { obtainedAt: 1 } },
    });
  });

  it("미인증 → 401", async () => {
    vi.mocked(ensureUser).mockResolvedValueOnce(null);
    expect((await post(OWNED)).status).toBe(401);
  });

  it("미존재 칭호 → 400 unknown_title", async () => {
    const res = await post("__no_such_title__");
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("unknown_title");
    expect(equipped()).toBe(null);
  });

  it("보유하지 않은 칭호 → 400 not_owned", async () => {
    store.set(k("u1", "adventure-log.v2"), { titles: {} });
    const res = await post(OWNED);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("not_owned");
    expect(equipped()).toBe(null);
  });

  it("일반 계정은 저장 데이터에 GM이 있어도 장착할 수 없다", async () => {
    store.set(k("u1", "adventure-log.v2"), {
      titles: { [GM_TITLE_ID]: { obtainedAt: 1 } },
    });
    const res = await post(GM_TITLE_ID);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("unknown_title");
    expect(equipped()).toBe(null);
  });

  it("어드민 계정은 별도 지급 없이 GM을 장착할 수 있다", async () => {
    const previous = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = "admin@example.com";
    account.email = "ADMIN@example.com";
    store.set(k("u1", "adventure-log.v2"), { titles: {} });
    try {
      const res = await post(GM_TITLE_ID);
      expect(res.status).toBe(200);
      expect(equipped()).toBe(GM_TITLE_ID);
    } finally {
      if (previous === undefined) delete process.env.ADMIN_EMAILS;
      else process.env.ADMIN_EMAILS = previous;
    }
  });

  it("보유 칭호 → 200, 장착 + 다른 필드 보존", async () => {
    const res = await post(OWNED);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { equippedTitleId: string }).equippedTitleId).toBe(
      OWNED,
    );
    expect(equipped()).toBe(OWNED);
    // 기존 character.v2 필드 보존(스프레드).
    expect((store.get(k("u1", "character.v2")) as { level: number }).level).toBe(5);
  });

  it("null → 200, 해제 (보유 검증 스킵)", async () => {
    store.set(k("u1", "character.v2"), { level: 5, equippedTitleId: OWNED });
    const res = await post(null);
    expect(res.status).toBe(200);
    expect(equipped()).toBe(null);
  });
});
