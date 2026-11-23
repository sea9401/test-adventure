import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));

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
  assembleQuestExtras: vi.fn(async () => ({
    hasGuild: false,
    hasTraded: false,
    arenaPlayed: false,
    arenaWins: 0,
    fishCaught: 0,
    arenaTimes: [],
    fishSpecies: 0,
  })),
  buildQuestCtx: vi.fn(({ charRaw, skillsRaw }) => ({
    class: "none",
    level: 1,
    tier: 1,
    // 기초 튜토리얼은 첫 전투를 치른 뒤에 열린다.
    battleCount: 1,
    frontierDepth: 2,
    equippedCount: 0,
    uniqueAcquired: 0,
    cultivations: 0,
    bossKills: 0,
    hasGuild: false,
    hasTraded: false,
    arenaPlayed: false,
    arenaWins: 0,
    gold: Number((charRaw as { gold?: number }).gold ?? 0),
    outpostsDiscovered: 0,
    titleCount: 0,
    cumLevel: 0,
    reincarnations: 0,
    speciesKilled: 0,
    fishSpecies: 0,
    maxEnhanceLevel: 0,
    enhanceStones: 0,
    bankedGold: Number((charRaw as { bankedGold?: number }).bankedGold ?? 0),
    skillsEquipped: Array.isArray(
      (skillsRaw as { equipped?: unknown } | undefined)?.equipped,
    )
      ? ((skillsRaw as { equipped: unknown[] }).equipped.length)
      : 0,
    skillsLearned: Array.isArray(
      (skillsRaw as { learned?: unknown } | undefined)?.learned,
    )
      ? ((skillsRaw as { learned: unknown[] }).learned.length)
      : 0,
    hasEditedSkillLoadout: Boolean(
      (charRaw as { hasEditedSkillLoadout?: unknown }).hasEditedSkillLoadout,
    ),
    hasHealed: false,
    hasShopped: false,
    workshopCrafts: 0,
    workshopQualityCrafts: 0,
    blacksmithLevel: 1,
  })),
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

vi.mock("@/lib/server/grantTitle", () => ({
  grantTitleIfMissingInTx: vi.fn(async () => false),
  ownedTitleIdsOf: vi.fn((raw: unknown) => {
    const titles = (raw as { titles?: Record<string, unknown> } | undefined)?.titles;
    return titles && typeof titles === "object" ? Object.keys(titles) : [];
  }),
}));

import { POST } from "@/app/api/v2/me/quests/claim/route";
import { grantTitleIfMissingInTx } from "@/lib/server/grantTitle";
import { buildQuestCtx } from "@/lib/server/v2QuestContext";

function claimReq(questId: string): Request {
  return new Request("http://t/api/v2/me/quests/claim", {
    method: "POST",
    body: JSON.stringify({ questId }),
  });
}

describe("POST /api/v2/me/quests/claim", () => {
  beforeEach(() => {
    store.clear();
    store.set("character.v2", { gold: 10_000, bankedGold: 250 });
    store.set("equipment.v2", { owned: [], equipped: {} });
    store.set("guide-quests.v2", { claimed: [] });
    vi.mocked(grantTitleIfMissingInTx).mockResolvedValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("업적을 수령해도 골드를 지급하지 않는다", async () => {
    const res = await POST(claimReq("x_rich"));
    expect(res.status).toBe(200);

    const json = (await res.json()) as {
      ok: boolean;
      reward: { gold: number };
      gold: number;
      bankedGold: number;
    };
    expect(json.ok).toBe(true);
    expect(json.reward.gold).toBe(0);
    expect(json.gold).toBe(10_000);
    expect(json.bankedGold).toBe(250);

    const char = store.get("character.v2") as {
      gold: number;
      bankedGold: number;
    };
    expect(char.gold).toBe(10_000);
    expect(char.bankedGold).toBe(250);
  });

  it("성장 패스 단계를 받으면 귀속 회복약과 숙련 증서가 들어오고 신규 모험가는 회복약을 더 받는다", async () => {
    const base = vi.mocked(buildQuestCtx).getMockImplementation()!;
    vi.mocked(buildQuestCtx).mockImplementation((args) => ({
      ...base(args),
      maxJobTier: 4,
      newcomer: true,
    }));
    store.set("inventory.v2", { masteryCertificates: 40, v2_herb: 3 });
    store.set("stamina-potions.v1", { count: 2, boundCount: 1 });

    try {
      const res = await POST(claimReq("gp_tier4"));
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({
        ok: true,
        questId: "gp_tier4",
        reward: {
          staminaPotions: 0,
          boundStaminaPotions: 10,
          masteryCertificates: 1_000,
        },
      });
      expect(store.get("stamina-potions.v1")).toEqual({ count: 12, boundCount: 11 });
      expect(store.get("inventory.v2")).toEqual({
        masteryCertificates: 1_040,
        v2_herb: 3,
      });
      expect(store.get("guide-quests.v2")).toEqual({ claimed: ["gp_tier4"] });

      // 같은 단계를 다시 받을 수 없다.
      const again = await POST(claimReq("gp_tier4"));
      expect(again.status).not.toBe(200);
      expect(store.get("stamina-potions.v1")).toEqual({ count: 12, boundCount: 11 });
    } finally {
      vi.mocked(buildQuestCtx).mockImplementation(base);
    }
  });

  it("3차 직업에 도달하지 않은 계정은 성장 패스 단계를 받을 수 없다", async () => {
    const res = await POST(claimReq("gp_tier4"));
    expect(res.status).not.toBe(200);
    expect(store.has("stamina-potions.v1")).toBe(false);
  });

  it("이미 수령한 퀘스트에 나중에 붙은 칭호는 칭호만 소급 지급한다", async () => {
    store.set("guide-quests.v2", { claimed: ["a_depth48"] });
    vi.mocked(grantTitleIfMissingInTx).mockResolvedValueOnce(true);

    const res = await POST(claimReq("a_depth48"));
    expect(res.status).toBe(200);

    const json = (await res.json()) as {
      ok: boolean;
      retroactive: boolean;
      reward: { gold: number; titleId: string };
      bankedGold: number;
    };
    expect(json).toMatchObject({
      ok: true,
      retroactive: true,
      reward: { gold: 0, titleId: "ach_frontier_end" },
      bankedGold: 250,
    });
    expect(grantTitleIfMissingInTx).toHaveBeenCalledWith(
      expect.anything(),
      "u-test",
      "ach_frontier_end",
      expect.any(Number),
    );
  });

  it("로드아웃 행동 플래그가 없어도 현재 스킬 장착 상태로 기술 연마를 수령한다", async () => {
    store.set("skills.v2", {
      learned: ["v2_skill_strike"],
      equipped: ["v2_skill_strike"],
    });

    const res = await POST(claimReq("b_skill"));
    const json = (await res.json()) as { ok: boolean; questId: string };

    expect(res.status).toBe(200);
    expect(json).toMatchObject({ ok: true, questId: "b_skill" });
    expect(store.get("guide-quests.v2")).toEqual({ claimed: ["b_skill"] });
  });

  it("추적 중인 업적을 수령하면 추적을 해제하고 다른 업적 추적은 보존한다", async () => {
    store.set("skills.v2", {
      learned: ["v2_skill_strike"],
      equipped: ["v2_skill_strike"],
    });
    store.set("guide-quests.v2", {
      claimed: [],
      trackedQuestId: "b_skill",
    });

    expect((await POST(claimReq("b_skill"))).status).toBe(200);
    expect(store.get("guide-quests.v2")).toEqual({ claimed: ["b_skill"] });

    store.set("guide-quests.v2", {
      claimed: [],
      trackedQuestId: "x_rich",
    });
    expect((await POST(claimReq("b_skill"))).status).toBe(200);
    expect(store.get("guide-quests.v2")).toEqual({
      claimed: ["b_skill"],
      trackedQuestId: "x_rich",
    });
  });
});
