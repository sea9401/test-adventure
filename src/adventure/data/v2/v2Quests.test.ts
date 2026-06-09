import { describe, expect, it } from "vitest";
import {
  V2_QUESTS,
  QUEST_LINES,
  questById,
  questStatus,
  isQuestClaimable,
  deriveQuestViews,
  currentGuideQuest,
  type QuestCtx,
} from "./v2Quests";
import { V2_EQUIPMENT } from "./v2Equipment";

// 신규 캐릭터 기준(아무것도 안 함).
const ZERO: QuestCtx = {
  level: 1,
  tier: 1,
  specChosen: false,
  passivePicks: 0,
  battleCount: 0,
  frontierDepth: 2,
  equippedCount: 0,
  cultivations: 0,
  bossKills: 0,
};

const none = new Set<string>();

describe("v2Quests 카탈로그 무결성", () => {
  it("id 중복 없음 + 라인 id 가 정의된 라인", () => {
    const ids = new Set(V2_QUESTS.map((q) => q.id));
    expect(ids.size).toBe(V2_QUESTS.length);
    const lineIds = new Set(QUEST_LINES.map((l) => l.id));
    for (const q of V2_QUESTS) {
      expect(lineIds.has(q.line), `${q.id} 라인`).toBe(true);
    }
  });

  it("보상 장비는 카탈로그에 존재(쇠사슬 갑옷 등)", () => {
    for (const q of V2_QUESTS) {
      if (q.reward.equip) {
        expect(V2_EQUIPMENT[q.reward.equip], q.reward.equip).toBeDefined();
      }
    }
  });

  it("questById 로 조회", () => {
    expect(questById("g_first_battle")?.title).toBe("첫 발걸음");
    expect(questById("없는퀘")).toBeUndefined();
  });
});

describe("성장의 길 (순차 라인)", () => {
  it("신규 캐릭터 — 첫 퀘만 active, 나머지는 locked", () => {
    expect(questStatus(questById("g_first_battle")!, ZERO, none)).toBe("active");
    expect(questStatus(questById("g_equip")!, ZERO, none)).toBe("locked");
    expect(questStatus(questById("g_cap1")!, ZERO, none)).toBe("locked");
  });

  it("첫 전투 후 — g_first_battle 수령 가능, 그 다음은 아직 잠김(앞 미수령이어도 조건 기반 해금)", () => {
    const ctx = { ...ZERO, battleCount: 1 };
    expect(questStatus(questById("g_first_battle")!, ctx, none)).toBe(
      "claimable",
    );
    // g_equip 은 앞(g_first_battle) check 가 true 라 열림 → 하지만 장착 0 이라 active.
    expect(questStatus(questById("g_equip")!, ctx, none)).toBe("active");
    // g_depth5 는 앞(g_equip) check false → 잠김.
    expect(questStatus(questById("g_depth5")!, ctx, none)).toBe("locked");
  });

  it("앞 퀘 조건만 충족하면 뒤 퀘도 동시 수령 가능(수령 순서 강제 안 함)", () => {
    // 전투 + 장착 둘 다 충족 → 둘 다 claimable.
    const ctx = { ...ZERO, battleCount: 3, equippedCount: 2 };
    expect(isQuestClaimable(questById("g_first_battle")!, ctx, none)).toBe(true);
    expect(isQuestClaimable(questById("g_equip")!, ctx, none)).toBe(true);
    // depth5 는 미충족 → active.
    expect(questStatus(questById("g_depth5")!, ctx, none)).toBe("active");
  });

  it("수령 처리 — claimed 집합에 들면 claimed", () => {
    const ctx = { ...ZERO, battleCount: 1 };
    const claimed = new Set(["g_first_battle"]);
    expect(questStatus(questById("g_first_battle")!, ctx, claimed)).toBe(
      "claimed",
    );
    expect(isQuestClaimable(questById("g_first_battle")!, ctx, claimed)).toBe(
      false,
    );
  });

  it("전직/전문화 체인 — tier·specChoice·passive 로 진행", () => {
    const t2 = { ...ZERO, level: 60, battleCount: 99, equippedCount: 6, frontierDepth: 14, tier: 2 };
    expect(isQuestClaimable(questById("g_advance2")!, t2, none)).toBe(true);
    expect(questStatus(questById("g_spec")!, t2, none)).toBe("active"); // 전직했지만 전문화 미선택
    const spec = { ...t2, specChosen: true, passivePicks: 1, cultivations: 2 };
    expect(isQuestClaimable(questById("g_spec")!, spec, none)).toBe(true);
    expect(isQuestClaimable(questById("g_passive")!, spec, none)).toBe(true);
    expect(isQuestClaimable(questById("g_cultivate")!, spec, none)).toBe(true);
    expect(isQuestClaimable(questById("g_frontier")!, spec, none)).toBe(true);
  });
});

describe("정점을 향해 (비순차 라인 — 마일스톤 독립)", () => {
  it("순차 잠금 없음 — 깊이 25 만 충족해도 바로 수령 가능(보스/3차 무관)", () => {
    const ctx = { ...ZERO, frontierDepth: 25 };
    expect(isQuestClaimable(questById("a_depth25")!, ctx, none)).toBe(true);
    // 다른 마일스톤은 미충족 → active(잠김 아님).
    expect(questStatus(questById("a_boss")!, ctx, none)).toBe("active");
    expect(questStatus(questById("a_advance3")!, ctx, none)).toBe("active");
  });

  it("보스 처치 / 고차수 마일스톤", () => {
    expect(isQuestClaimable(questById("a_boss")!, { ...ZERO, bossKills: 1 }, none)).toBe(true);
    expect(isQuestClaimable(questById("a_advance3")!, { ...ZERO, tier: 3 }, none)).toBe(true);
    expect(isQuestClaimable(questById("a_apex")!, { ...ZERO, tier: 4 }, none)).toBe(true);
  });
});

describe("currentGuideQuest (홈 배너)", () => {
  it("신규 캐릭터 — 첫 퀘(active) 안내", () => {
    expect(currentGuideQuest(ZERO, none)?.id).toBe("g_first_battle");
  });

  it("수령 가능한 게 있으면 그걸 우선 안내", () => {
    const ctx = { ...ZERO, battleCount: 1 };
    const cur = currentGuideQuest(ctx, none);
    expect(cur?.id).toBe("g_first_battle");
    expect(cur?.status).toBe("claimable");
  });

  it("성장의 길 전부 수령 후 — 정점 라인으로 넘어감", () => {
    const ctx: QuestCtx = {
      level: 60,
      tier: 2,
      specChosen: true,
      passivePicks: 1,
      battleCount: 99,
      frontierDepth: 14,
      equippedCount: 6,
      cultivations: 2,
      bossKills: 0,
    };
    const growthClaimed = new Set(
      V2_QUESTS.filter((q) => q.line === "growth").map((q) => q.id),
    );
    const cur = currentGuideQuest(ctx, growthClaimed);
    expect(cur?.line).toBe("ascend");
  });

  it("전부 수령 → null", () => {
    const ctx: QuestCtx = {
      level: 100,
      tier: 4,
      specChosen: true,
      passivePicks: 3,
      battleCount: 999,
      frontierDepth: 30,
      equippedCount: 6,
      cultivations: 9,
      bossKills: 3,
    };
    const all = new Set(V2_QUESTS.map((q) => q.id));
    expect(currentGuideQuest(ctx, all)).toBeNull();
  });
});

describe("deriveQuestViews", () => {
  it("모든 퀘스트에 status 부여", () => {
    const views = deriveQuestViews(ZERO, none);
    expect(views).toHaveLength(V2_QUESTS.length);
    expect(views.every((v) => v.status)).toBe(true);
  });
});
