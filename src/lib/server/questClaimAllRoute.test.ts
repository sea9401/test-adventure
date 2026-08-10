import { beforeEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-test"),
}));

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({})),
  },
}));

vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  readSave: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  upsertSave: vi.fn(async (_tx, _uid, key: string, value: unknown) => {
    store.set(key, value);
  }),
}));

vi.mock("@/lib/server/v2QuestContext", () => ({
  GUIDE_QUESTS_KEY: "guide-quests.v2",
  assembleQuestExtras: vi.fn(async () => ({})),
  buildQuestCtx: vi.fn(() => ({})),
  parseClaimed: vi.fn((raw: { claimed?: unknown } | undefined) =>
    new Set(Array.isArray(raw?.claimed) ? raw.claimed : []),
  ),
  parseTrackedQuestId: vi.fn(
    (raw: { trackedQuestId?: unknown } | undefined) =>
      typeof raw?.trackedQuestId === "string" ? raw.trackedQuestId : null,
  ),
  guideQuestSavePayload: vi.fn(
    (claimed: ReadonlySet<string>, trackedQuestId: string | null) =>
      trackedQuestId
        ? { claimed: [...claimed], trackedQuestId }
        : { claimed: [...claimed] },
  ),
}));

vi.mock("@/adventure/data/v2/v2Quests", () => ({
  V2_QUESTS: [
    {
      id: "tutorial_reward",
      line: "tutorial",
      reward: {
        gold: 100,
        equip: "v2_chain_mail",
        staminaPotions: 2,
        titleId: "first_blood",
      },
      check: () => true,
    },
    {
      id: "tutorial_empty",
      line: "tutorial",
      reward: {},
      check: () => true,
    },
    {
      id: "tutorial_followup",
      line: "tutorial",
      reward: { staminaPotions: 1 },
      check: () => true,
    },
    {
      id: "achievement_reward",
      line: "achievement",
      reward: { equip: "v2_chain_mail", titleId: "ach_full_gear" },
      check: () => true,
    },
    {
      id: "achievement_followup",
      line: "achievement",
      reward: { equip: "v2_chain_mail", titleId: "first_blood" },
      check: () => true,
    },
  ],
  claimedUniqueEquipmentAcquisitionFloor: vi.fn(() => 0),
  isTutorialLine: vi.fn((line: string) => line === "tutorial"),
  isQuestClaimable: vi.fn(
    (
      quest: { id: string; check: (ctx: unknown) => boolean },
      ctx: unknown,
      claimed: ReadonlySet<string>,
    ) => {
      if (claimed.has(quest.id) || !quest.check(ctx)) return false;
      if (quest.id === "tutorial_followup") {
        return claimed.has("tutorial_reward");
      }
      if (quest.id === "achievement_followup") {
        return claimed.has("achievement_reward");
      }
      return true;
    },
  ),
}));

vi.mock("@/lib/server/grantTitle", () => ({
  grantTitleIfMissingInTx: vi.fn(async () => true),
}));

vi.mock("@/lib/server/economyLog", () => ({
  recordEconomyEventSoon: vi.fn(),
  recordRewardFailureSoon: vi.fn(),
}));

import { POST } from "@/app/api/v2/me/quests/claim-all/route";
import { grantTitleIfMissingInTx } from "@/lib/server/grantTitle";
import {
  recordEconomyEventSoon,
  recordRewardFailureSoon,
} from "@/lib/server/economyLog";

function claimAllReq(scope: unknown): Request {
  return new Request("http://t/api/v2/me/quests/claim-all", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope }),
  });
}

describe("POST /api/v2/me/quests/claim-all", () => {
  beforeEach(() => {
    store.clear();
    store.set("character.v2", { gold: 10_000, bankedGold: 250 });
    store.set("equipment.v2", { owned: [], equipped: {} });
    store.set("guide-quests.v2", { claimed: [] });
    store.set("stamina-potions.v1", { count: 3 });
    vi.clearAllMocks();
    vi.mocked(grantTitleIfMissingInTx).mockResolvedValue(true);
  });

  it("현재 보이는 튜토리얼 보상을 합산 지급하고 후속 체인은 남겨 둔다", async () => {
    const res = await POST(claimAllReq("tutorial"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      count: 2,
      reward: {
        gold: 100,
        equipment: ["v2_chain_mail"],
        staminaPotions: 2,
        titleIds: ["first_blood"],
      },
    });

    expect(store.get("character.v2")).toMatchObject({ bankedGold: 350 });
    expect(store.get("equipment.v2")).toMatchObject({
      owned: [expect.objectContaining({ id: "v2_chain_mail" })],
      equipped: {},
    });
    expect(store.get("stamina-potions.v1")).toEqual({ count: 5 });
    expect(store.get("guide-quests.v2")).toEqual({
      claimed: ["tutorial_reward", "tutorial_empty"],
    });
    expect(recordEconomyEventSoon).toHaveBeenCalledTimes(3);
  });

  it("첫 일괄 수령 뒤 공개된 후속 체인은 다음 요청에서 받는다", async () => {
    await POST(claimAllReq("tutorial"));
    vi.clearAllMocks();

    const res = await POST(claimAllReq("tutorial"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      count: 1,
      reward: { staminaPotions: 1 },
    });
    expect(store.get("guide-quests.v2")).toEqual({
      claimed: [
        "tutorial_reward",
        "tutorial_empty",
        "tutorial_followup",
      ],
    });
  });

  it("업적은 수령으로 공개된 후속 단계까지 모두 받고 선택한 탭 밖은 건드리지 않는다", async () => {
    store.set("guide-quests.v2", {
      claimed: [],
      trackedQuestId: "achievement_followup",
    });
    const res = await POST(claimAllReq("achievement"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      count: 2,
      reward: {
        equipment: ["v2_chain_mail", "v2_chain_mail"],
        titleIds: ["ach_full_gear", "first_blood"],
      },
    });
    expect(store.get("guide-quests.v2")).toEqual({
      claimed: ["achievement_reward", "achievement_followup"],
    });
  });

  it("받을 항목이 없으면 중복 지급하지 않는다", async () => {
    store.set("guide-quests.v2", {
      claimed: ["achievement_reward", "achievement_followup"],
    });

    const res = await POST(claimAllReq("achievement"));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      ok: false,
      error: "nothing_to_claim",
    });
    expect(grantTitleIfMissingInTx).not.toHaveBeenCalled();
    expect(recordRewardFailureSoon).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "quest_all",
        error: "nothing_to_claim",
      }),
    );
  });

  it("허용되지 않은 범위를 거부한다", async () => {
    const res = await POST(claimAllReq("daily"));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      ok: false,
      error: "invalid_scope",
    });
  });
});
