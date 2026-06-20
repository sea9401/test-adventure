// 발굴 보관함 등급 일괄 판매 라우트 통합 테스트 — POST /api/v2/treasure/sell-bulk.
// savesKv(lock/upsert)를 stateful 인메모리로 모킹하고, 실제 순수 로직(treasureCollection·antique
// 카탈로그)을 통과시켜 ① 희귀↑ 차단(고가품 보호) ② 흔함·보통 일괄 성공·골드 정산·remaining
// ③ 0매칭·잘못된 등급을 검증한다. db.transaction 은 더미 tx 로 콜백만 실행.

import { beforeEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));
const k = (userId: string, key: string) => `${userId}::${key}`;

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async (): Promise<string | null> => "u1"),
}));
vi.mock("@/db", () => ({
  db: { transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({})) },
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(
    async (_tx: unknown, userId: string, key: string, fallback: unknown) =>
      store.has(k(userId, key)) ? store.get(k(userId, key)) : fallback,
  ),
  upsertSave: vi.fn(
    async (_tx: unknown, userId: string, key: string, value: unknown) => {
      store.set(k(userId, key), value);
    },
  ),
}));

import { POST } from "@/app/api/v2/treasure/sell-bulk/route";
import { TREASURE_COLLECTION_KEY } from "@/adventure/v2/treasureCollection";
import { sellGoldValue } from "@/adventure/data/v2/antique";
import { ensureUser } from "@/lib/server/ensureUser";

type Inst = { instanceId: string; antiqueId: string; condition: number; foundAt: number };
const inst = (instanceId: string, antiqueId: string, condition = 60): Inst => ({
  instanceId,
  antiqueId,
  condition,
  foundAt: 1,
});

function req(body: unknown): Request {
  return new Request("http://t/api/v2/treasure/sell-bulk", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function seed(instances: Inst[], gold = 1000) {
  store.set(k("u1", TREASURE_COLLECTION_KEY), { instances });
  store.set(k("u1", "character.v2"), { gold });
}

const collOf = () =>
  (store.get(k("u1", TREASURE_COLLECTION_KEY)) as { instances: Inst[] }).instances;
const goldOf = () => (store.get(k("u1", "character.v2")) as { gold: number }).gold;

describe("POST /api/v2/treasure/sell-bulk", () => {
  beforeEach(() => {
    store.clear();
    vi.mocked(ensureUser).mockResolvedValue("u1");
  });

  it("미인증 → 401", async () => {
    vi.mocked(ensureUser).mockResolvedValueOnce(null);
    const res = await POST(req({ maxTier: "common" }));
    expect(res.status).toBe(401);
  });

  it("enum 밖 등급 → 400 bad_tier", async () => {
    seed([inst("a", "clay_shard")]);
    const res = await POST(req({ maxTier: "garbage" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("bad_tier");
    expect(collOf()).toHaveLength(1); // 불변
  });

  it("희귀/영웅/전설 maxTier → 400 tier_not_bulk_sellable, 판매 0 (고가품 보호)", async () => {
    for (const tier of ["rare", "epic", "legendary"]) {
      seed([inst("a", "clay_shard"), inst("z", "gold_coin")]); // 흔함 + 희귀
      const res = await POST(req({ maxTier: tier }));
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe(
        "tier_not_bulk_sellable",
      );
      expect(collOf()).toHaveLength(2); // 아무것도 안 팔림
      expect(goldOf()).toBe(1000);
    }
  });

  it("흔함·보통 일괄 → 200, 흔함+보통만 팔리고 희귀↑ 잔존, 골드 정산", async () => {
    seed(
      [
        inst("a", "clay_shard", 80), // 흔함
        inst("b", "bronze_mirror", 50), // 보통
        inst("c", "gold_coin", 90), // 희귀 — 보호
      ],
      1000,
    );
    const res = await POST(req({ maxTier: "uncommon" }));
    expect(res.status).toBe(200);
    const j = (await res.json()) as {
      ok: boolean;
      soldCount: number;
      goldGained: number;
      gold: number;
      instances: Inst[];
    };
    const expectedGold =
      sellGoldValue("clay_shard", 80) + sellGoldValue("bronze_mirror", 50);
    expect(j.soldCount).toBe(2);
    expect(j.goldGained).toBe(expectedGold);
    expect(j.gold).toBe(1000 + expectedGold);
    // 응답·저장 모두 희귀(c)만 남음.
    expect(j.instances.map((i) => i.instanceId)).toEqual(["c"]);
    expect(collOf().map((i) => i.instanceId)).toEqual(["c"]);
    expect(goldOf()).toBe(1000 + expectedGold);
  });

  it("매칭 0(희귀↑만 보유) → soldCount 0, 골드·보관함 불변", async () => {
    seed([inst("c", "gold_coin")], 1000); // 희귀뿐
    const res = await POST(req({ maxTier: "uncommon" }));
    expect(res.status).toBe(200);
    const j = (await res.json()) as { soldCount: number; gold: number };
    expect(j.soldCount).toBe(0);
    expect(j.gold).toBe(1000);
    expect(collOf()).toHaveLength(1);
  });
});
