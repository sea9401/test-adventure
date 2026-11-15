import { afterEach, describe, expect, it, vi } from "vitest";

const { saves, ensureUser } = vi.hoisted(() => ({
  saves: new Map<string, unknown>(),
  ensureUser: vi.fn(async (): Promise<string | null> => "u-growth"),
}));

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/server/ensureUser", () => ({ ensureUser }));
vi.mock("@/lib/server/savesKv", () => ({
  readSave: vi.fn(async (_db: object, _userId: string, key: string, fallback: unknown) =>
    saves.has(key) ? saves.get(key) : fallback,
  ),
}));

import { GET } from "./route";
import { V2_LEVEL_CAP } from "@/adventure/data/v2/coreLoopConfig";
import { GROWTH_GUIDE_QUEST_IDS } from "@/adventure/data/v2/growthGuide";

async function step() {
  const response = await GET();
  return (await response.json()) as { ok: boolean; step: Record<string, unknown> | null };
}

afterEach(() => {
  saves.clear();
  ensureUser.mockClear();
});

describe("GET /api/v2/me/quests/growth-step", () => {
  it("로그인하지 않았으면 401", async () => {
    ensureUser.mockResolvedValueOnce(null);
    expect((await GET()).status).toBe(401);
  });

  it("사냥 전에는 첫 단계가 진행 중이다", async () => {
    saves.set("character.v2", { class: "none", level: 1 });
    expect((await step()).step).toMatchObject({
      id: "g_first_battle",
      status: "active",
      title: "첫 발걸음",
      stepNumber: 1,
      stepCount: GROWTH_GUIDE_QUEST_IDS.length,
    });
  });

  it("첫 전투를 치르면 첫 단계 보상을 받을 수 있다", async () => {
    saves.set("character.v2", { class: "none", level: 2 });
    saves.set("adventure-log.v2", { monsters: { slime: { kills: 1 } } });
    const json = await step();
    expect(json.step).toMatchObject({
      id: "g_first_battle",
      status: "claimable",
      reward: { equip: "v2_chain_mail", staminaPotions: 1, titleId: "first_blood" },
    });
  });

  it("받은 단계는 건너뛰고 다음 단계와 이동할 곳을 알려 준다", async () => {
    saves.set("character.v2", { class: "none", level: 2 });
    saves.set("adventure-log.v2", { monsters: { slime: { kills: 3 } } });
    saves.set("guide-quests.v2", { claimed: ["g_first_battle"] });
    expect((await step()).step).toMatchObject({
      id: "g_equip",
      status: "active",
      href: "/character/inventory",
      stepNumber: 2,
    });
  });

  it("목표 수치가 있는 단계는 진행도를 함께 준다", async () => {
    saves.set("character.v2", {
      class: "none",
      level: 7,
      hasManuallyEquippedGear: true,
      hasBattledAfterEquippingGear: true,
    });
    saves.set("adventure-log.v2", { monsters: { slime: { kills: 30 } } });
    saves.set("guide-quests.v2", { claimed: ["g_first_battle", "g_equip", "g_equipped_battle"] });
    expect((await step()).step).toMatchObject({ id: "g_level10", status: "active", progress: 7, goal: 10 });
  });

  it("레벨 한계에 닿은 모험가에게는 첫 직업 단계를 알려 준다", async () => {
    saves.set("character.v2", {
      class: "none",
      level: V2_LEVEL_CAP,
      frontierDepth: 20,
      hasManuallyEquippedGear: true,
      hasBattledAfterEquippingGear: true,
    });
    saves.set("adventure-log.v2", { monsters: { slime: { kills: 5000 } } });
    saves.set("guide-quests.v2", {
      claimed: GROWTH_GUIDE_QUEST_IDS.slice(0, GROWTH_GUIDE_QUEST_IDS.indexOf("g_first_job")),
    });
    expect((await step()).step).toMatchObject({ id: "g_first_job", status: "active", href: "/character/shrine" });
  });

  it("성장의 길을 모두 받았으면 단계가 없다", async () => {
    saves.set("character.v2", { class: "warrior", level: 50 });
    saves.set("guide-quests.v2", { claimed: [...GROWTH_GUIDE_QUEST_IDS] });
    expect(await step()).toEqual({ ok: true, step: null });
  });
});
