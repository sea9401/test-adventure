// 마일스톤 번들 수령 라우트 통합 테스트 — POST /api/v2/me/quests/claim-bundle.
// savesKv stateful 모킹 + 신호(buildRepeatSignals) 모킹 + 실제 deriveRepeatBundle 통과로
// ① bad_scope ② 완료 달성 시 포션 지급 + bundleClaimed ③ 이미 수령 409 ④ 완료 부족 not_complete 검증.

import { beforeEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));
const k = (u: string, key: string) => `${u}::${key}`;

// 일일 4개 완료(아레나 제외) 되는 신호.
const SIGNALS = {
  battleCount: 1000,
  siegeAttempts: 10,
  siegeWins: 5,
  warTreasuryGold: 20000,
  fishCaught: 50,
  enhanceAttempts: 7,
  arenaTimes: [] as number[],
};

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
  readSave: vi.fn(
    async (_tx: unknown, u: string, key: string, fb: unknown) =>
      store.has(k(u, key)) ? store.get(k(u, key)) : fb,
  ),
  upsertSave: vi.fn(
    async (_tx: unknown, u: string, key: string, v: unknown) => {
      store.set(k(u, key), v);
    },
  ),
}));
vi.mock("@/lib/server/v2QuestContext", () => ({
  REPEAT_QUESTS_KEY: "repeat-quests.v2",
  assembleQuestExtras: vi.fn(async () => ({})),
  buildRepeatSignals: vi.fn(() => SIGNALS),
}));

import { POST } from "@/app/api/v2/me/quests/claim-bundle/route";
import { kstDailyKey } from "@/adventure/data/v2/v2RepeatQuests";
import { STAMINA_POTIONS_KEY } from "@/adventure/v2/staminaPotions";
import { buildRepeatSignals } from "@/lib/server/v2QuestContext";
import { ensureUser } from "@/lib/server/ensureUser";

const BASE_ZERO = {
  battleCount: 0,
  siegeAttempts: 0,
  siegeWins: 0,
  warTreasuryGold: 0,
  fishCaught: 0,
  enhanceAttempts: 0,
};

function req(body: unknown): Request {
  return new Request("http://t/api/v2/me/quests/claim-bundle", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function seedDaily(over?: Record<string, unknown>) {
  store.set(k("u1", "repeat-quests.v2"), {
    daily: {
      key: kstDailyKey(new Date()),
      baseline: BASE_ZERO,
      claimed: [],
      ...over,
    },
  });
}

const repeatSave = () =>
  store.get(k("u1", "repeat-quests.v2")) as {
    daily: { bundleClaimed?: boolean };
  };
const potCount = () =>
  ((store.get(k("u1", STAMINA_POTIONS_KEY)) as { count?: number } | undefined)
    ?.count ?? 0);

describe("POST /api/v2/me/quests/claim-bundle", () => {
  beforeEach(() => {
    store.clear();
    vi.mocked(ensureUser).mockResolvedValue("u1");
    vi.mocked(buildRepeatSignals).mockReturnValue(SIGNALS);
  });

  it("미인증 → 401", async () => {
    vi.mocked(ensureUser).mockResolvedValueOnce(null);
    const res = await POST(req({ scope: "daily" }));
    expect(res.status).toBe(401);
  });

  it("잘못된 scope → 400 bad_scope", async () => {
    seedDaily();
    const res = await POST(req({ scope: "garbage" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("bad_scope");
  });

  it("일일 4개 완료 → 200, 포션 2 지급 + bundleClaimed", async () => {
    seedDaily();
    store.set(k("u1", STAMINA_POTIONS_KEY), { count: 1 });
    const res = await POST(req({ scope: "daily" }));
    const j = (await res.json()) as { potions: number; staminaPotions: number };
    expect(res.status).toBe(200);
    expect(j.potions).toBe(2);
    expect(j.staminaPotions).toBe(3); // 1 + 2
    expect(potCount()).toBe(3);
    expect(repeatSave().daily.bundleClaimed).toBe(true);
  });

  it("이미 수령 → 409, 추가 지급 없음", async () => {
    seedDaily({ bundleClaimed: true });
    store.set(k("u1", STAMINA_POTIONS_KEY), { count: 5 });
    const res = await POST(req({ scope: "daily" }));
    expect(res.status).toBe(409);
    expect(potCount()).toBe(5); // 불변
  });

  it("완료 수 부족 → 400 not_complete, 미지급", async () => {
    vi.mocked(buildRepeatSignals).mockReturnValueOnce({
      ...SIGNALS,
      battleCount: 5,
      fishCaught: 0,
    });
    seedDaily();
    const res = await POST(req({ scope: "daily" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "not_complete",
    );
    expect(repeatSave().daily.bundleClaimed).toBeFalsy();
  });
});
