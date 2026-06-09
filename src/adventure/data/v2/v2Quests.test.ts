import { describe, expect, it } from "vitest";
import {
  V2_QUESTS,
  QUEST_LINES,
  questById,
  questStatus,
  isQuestClaimable,
  deriveQuestViews,
  currentGuideQuest,
  questLinesFor,
  type QuestCtx,
} from "./v2Quests";
import { V2_EQUIPMENT } from "./v2Equipment";

// 신규 캐릭터 기준(전사, 아무것도 안 함). 부분 ctx 는 이걸 스프레드.
const ZERO: QuestCtx = {
  class: "warrior",
  level: 1,
  tier: 1,
  specChosen: false,
  passivePicks: 0,
  battleCount: 0,
  frontierDepth: 2,
  equippedCount: 0,
  uniqueOwned: 0,
  cultivations: 0,
  bossKills: 0,
  hasGuild: false,
  hasTraded: false,
  arenaPlayed: false,
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

  it("직업 4종 각각 전용 라인(class_*) 3퀘 보유", () => {
    for (const cls of ["warrior", "martial", "mage", "rogue"]) {
      const line = QUEST_LINES.find((l) => l.id === `class_${cls}`);
      expect(line?.classOnly, cls).toBe(cls);
      expect(V2_QUESTS.filter((q) => q.line === `class_${cls}`)).toHaveLength(3);
    }
  });
});

describe("성장의 길 (순차 라인)", () => {
  it("신규 캐릭터 — 첫 퀘만 active, 나머지는 locked", () => {
    expect(questStatus(questById("g_first_battle")!, ZERO, none)).toBe("active");
    expect(questStatus(questById("g_equip")!, ZERO, none)).toBe("locked");
  });

  it("앞 퀘 조건만 충족하면 뒤 퀘도 동시 수령 가능(수령 순서 강제 안 함)", () => {
    const ctx = { ...ZERO, battleCount: 3, equippedCount: 2 };
    expect(isQuestClaimable(questById("g_first_battle")!, ctx, none)).toBe(true);
    expect(isQuestClaimable(questById("g_equip")!, ctx, none)).toBe(true);
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
});

describe("직업 전용 라인 (classOnly)", () => {
  it("현 직군 라인만 보임 — 전사는 class_warrior 보이고 class_mage 안 보임", () => {
    const lines = questLinesFor(ZERO).map((l) => l.id);
    expect(lines).toContain("class_warrior");
    expect(lines).not.toContain("class_mage");
    const ids = deriveQuestViews(ZERO, none).map((v) => v.id);
    expect(ids).toContain("c_warrior_spec");
    expect(ids).not.toContain("c_mage_spec");
  });

  it("마법사는 class_mage 만 보임", () => {
    const mage = { ...ZERO, class: "mage" as const };
    const lines = questLinesFor(mage).map((l) => l.id);
    expect(lines).toContain("class_mage");
    expect(lines).not.toContain("class_warrior");
  });

  it("계파 진행 — 전문화 선택 → 패시브 2 → 패시브 3", () => {
    const spec = { ...ZERO, specChosen: true };
    expect(isQuestClaimable(questById("c_warrior_spec")!, spec, none)).toBe(
      true,
    );
    expect(questStatus(questById("c_warrior_deepen")!, spec, none)).toBe(
      "active",
    );
    const p2 = { ...spec, passivePicks: 2 };
    expect(isQuestClaimable(questById("c_warrior_deepen")!, p2, none)).toBe(
      true,
    );
    const p3 = { ...spec, passivePicks: 3 };
    expect(isQuestClaimable(questById("c_warrior_apex")!, p3, none)).toBe(true);
  });

  it("교차 직군 수령 차단 — 전사가 specChosen 이어도 class_mage 퀘 수령 불가", () => {
    const spec = { ...ZERO, specChosen: true };
    expect(isQuestClaimable(questById("c_mage_spec")!, spec, none)).toBe(false);
    // 마법사면 반대로 가능.
    const mageSpec = { ...spec, class: "mage" as const };
    expect(isQuestClaimable(questById("c_mage_spec")!, mageSpec, none)).toBe(
      true,
    );
  });
});

describe("모험가의 길 (콘텐츠·사회, 비순차)", () => {
  it("길드/거래소/투기장 마일스톤 독립 수령", () => {
    expect(
      isQuestClaimable(questById("s_guild")!, { ...ZERO, hasGuild: true }, none),
    ).toBe(true);
    expect(
      isQuestClaimable(
        questById("s_trade")!,
        { ...ZERO, hasTraded: true },
        none,
      ),
    ).toBe(true);
    expect(
      isQuestClaimable(
        questById("s_arena")!,
        { ...ZERO, arenaPlayed: true },
        none,
      ),
    ).toBe(true);
    expect(questStatus(questById("s_guild")!, ZERO, none)).toBe("active");
  });
});

describe("정점을 향해 (확장 마일스톤)", () => {
  it("유니크 수집 / 깊이 40 / 보스 / 고차수", () => {
    expect(
      isQuestClaimable(questById("a_unique")!, { ...ZERO, uniqueOwned: 1 }, none),
    ).toBe(true);
    expect(
      isQuestClaimable(
        questById("a_depth40")!,
        { ...ZERO, frontierDepth: 40 },
        none,
      ),
    ).toBe(true);
    expect(
      isQuestClaimable(questById("a_boss")!, { ...ZERO, bossKills: 1 }, none),
    ).toBe(true);
    expect(
      isQuestClaimable(questById("a_apex")!, { ...ZERO, tier: 4 }, none),
    ).toBe(true);
  });

  it("비순차 — 깊이 40 만 충족해도 보스 미충족과 무관하게 수령", () => {
    const ctx = { ...ZERO, frontierDepth: 40 };
    expect(isQuestClaimable(questById("a_depth40")!, ctx, none)).toBe(true);
    expect(questStatus(questById("a_boss")!, ctx, none)).toBe("active");
  });
});

describe("currentGuideQuest (홈 배너)", () => {
  it("신규 캐릭터 — 첫 퀘(active) 안내", () => {
    expect(currentGuideQuest(ZERO, none)?.id).toBe("g_first_battle");
  });

  it("성장의 길 전부 수령 후 — 직업 라인으로 넘어감(라인 우선순위)", () => {
    const ctx: QuestCtx = {
      ...ZERO,
      level: 60,
      tier: 2,
      battleCount: 99,
      frontierDepth: 14,
      equippedCount: 6,
      cultivations: 2,
    };
    const growthClaimed = new Set(
      V2_QUESTS.filter((q) => q.line === "growth").map((q) => q.id),
    );
    const cur = currentGuideQuest(ctx, growthClaimed);
    expect(cur?.line).toBe("class_warrior");
  });

  it("전부 수령 → null", () => {
    const ctx: QuestCtx = {
      class: "warrior",
      level: 100,
      tier: 4,
      specChosen: true,
      passivePicks: 3,
      battleCount: 999,
      frontierDepth: 40,
      equippedCount: 6,
      uniqueOwned: 5,
      cultivations: 9,
      bossKills: 3,
      hasGuild: true,
      hasTraded: true,
      arenaPlayed: true,
    };
    const all = new Set(V2_QUESTS.map((q) => q.id));
    expect(currentGuideQuest(ctx, all)).toBeNull();
  });
});

describe("deriveQuestViews", () => {
  it("현 직군 가시 퀘스트에만 status 부여(타 직군 라인 제외)", () => {
    const views = deriveQuestViews(ZERO, none);
    const visibleCount = V2_QUESTS.filter(
      (q) => !q.line.startsWith("class_") || q.line === "class_warrior",
    ).length;
    expect(views).toHaveLength(visibleCount);
    expect(views.every((v) => v.status)).toBe(true);
  });
});
