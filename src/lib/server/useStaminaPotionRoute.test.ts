// 스태미나 포션 사용 라우트 통합 테스트 — POST /api/v2/me/use-stamina-potion.
// savesKv(lock/upsert)를 stateful 모킹하고 실제 스태미나 로직을 통과시켜 ① 포션 0 거부
// ② 사용 시 1 차감 + 스태미나 회복(최대치 캡)을 검증.

import { beforeEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));
const k = (u: string, key: string) => `${u}::${key}`;

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async (): Promise<string | null> => "u1"),
}));
vi.mock("@/db", () => ({
  db: { transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({})) },
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

import { POST } from "@/app/api/v2/me/use-stamina-potion/route";
import {
  STAMINA_POTIONS_KEY,
  STAMINA_POTION_RESTORE,
} from "@/adventure/v2/staminaPotions";
import { ensureUser } from "@/lib/server/ensureUser";

const char = () => store.get(k("u1", "character.v2")) as {
  stamina: { current: number };
};
const potCount = () =>
  (store.get(k("u1", STAMINA_POTIONS_KEY)) as { count: number }).count;

describe("POST /api/v2/me/use-stamina-potion", () => {
  beforeEach(() => {
    store.clear();
    vi.mocked(ensureUser).mockResolvedValue("u1");
  });

  it("미인증 → 401", async () => {
    vi.mocked(ensureUser).mockResolvedValueOnce(null);
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("포션 0 → 400 no_potion, 스태미나 불변", async () => {
    const t = Date.now();
    store.set(k("u1", "character.v2"), {
      stamina: { current: 100, lastUpdatedAt: t },
    });
    store.set(k("u1", STAMINA_POTIONS_KEY), { count: 0 });
    const res = await POST();
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("no_potion");
    expect(char().stamina.current).toBe(100);
  });

  it("사용 → 200, 포션 1 차감 + 스태미나 +RESTORE", async () => {
    const t = Date.now();
    store.set(k("u1", "character.v2"), {
      stamina: { current: 100, lastUpdatedAt: t },
    });
    store.set(k("u1", STAMINA_POTIONS_KEY), { count: 2 });
    const res = await POST();
    const j = (await res.json()) as { count: number; stamina: number };
    expect(res.status).toBe(200);
    expect(j.count).toBe(1);
    expect(j.stamina).toBe(100 + STAMINA_POTION_RESTORE);
    expect(potCount()).toBe(1);
    expect(char().stamina.current).toBe(100 + STAMINA_POTION_RESTORE);
  });
});
