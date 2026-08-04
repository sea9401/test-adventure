import { describe, expect, it } from "vitest";
import {
  V2_QUESTS,
  QUEST_LINES,
  questById,
  questStatus,
  isQuestClaimable,
  deriveQuestViews,
  currentGuideQuest,
  isTutorialLine,
  achievementSummary,
  type QuestCtx,
} from "./v2Quests";
import { V2_EQUIPMENT } from "./v2Equipment";
import { V2_LEVEL_CAP } from "./coreLoopConfig";
import { TITLES } from "../titles";
import { COOKING_RECIPES } from "../../v2/cooking";

// 테스트 기본값(1차 전사, 활동 없음). 부분 ctx 는 이걸 스프레드.
const ZERO: QuestCtx = {
  class: "warrior",
  level: 1,
  tier: 1,
  battleCount: 0,
  frontierDepth: 2,
  equippedCount: 0,
  hasManuallyEquippedGear: false,
  hasBattledAfterEquippingGear: false,
  uniqueOwned: 0,
  cultivations: 0,
  bossKills: 0,
  hasGuild: false,
  hasTraded: false,
  arenaPlayed: false,
  arenaWins: 0,
  gold: 0,
  outpostsDiscovered: 0,
  titleCount: 0,
  cumLevel: 1,
  reincarnations: 0,
  speciesKilled: 0,
  fishSpecies: 0,
  maxEnhanceLevel: 0,
  enhanceStones: 0,
  bankedGold: 0,
  skillsEquipped: 0,
  skillsLearned: 0,
  hasEditedSkillLoadout: false,
  hasHealed: false,
  hasShopped: false,
  workshopCrafts: 0,
  workshopQualityCrafts: 0,
  blacksmithLevel: 1,
  farmingLevel: 1,
  farmHarvests: 0,
  farmRareHarvests: 0,
  farmDeliveries: 0,
  farmReputationEarned: 0,
  woodcuttingLevel: 1,
  woodcuttingCuts: 0,
  woodcuttingSpecies: 0,
  miningLevel: 1,
  miningSuccesses: 0,
  miningByproducts: 0,
  miningSpecies: 0,
  fishingLevel: 1,
  fishCaught: 0,
  equipmentCodexRegistered: 0,
  equipmentCodexTotal: 240,
  masteryTowerFloor: 0,
  cookingLevel: 1,
  cookingRecipesDiscovered: 0,
  cookingDishesCooked: 0,
  cookingOrdersCompleted: 0,
  cookingMasterpiecesCooked: 0,
  cookingRareIngredientDishes: 0,
  guildDiningMeals: 0,
  guildTrainingDrills: 0,
  guildExpeditions: 0,
  guildWorkshopDeliveries: 0,
  guildAlchemyCrafts: 0,
  guildTradeContracts: 0,
};

const NEWCOMER: QuestCtx = { ...ZERO, class: "none", tier: 0 };

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

  it("제거된 지도·전쟁·벌목 미니게임 업적은 카탈로그에 없다", () => {
    const removedIds = [
      "b_travel",
      "wood_perfect1",
      "wood_perfect100",
      "wood_combo10",
      "wood_combo25",
      "wood_combo50",
      "grid_clear1",
      "grid_clear5",
      "grid_clear10",
      "w_first_claim",
      "w_hold",
      "w_siege5",
      "war_siege25",
      "w_captures5",
      "war_capture20",
      "w_eject",
      "war_eject20",
      "w_treasury",
      "war_treasury100k",
    ];

    for (const id of removedIds) expect(questById(id), id).toBeUndefined();
    expect(QUEST_LINES.some((line) => line.id === "war")).toBe(false);
  });

  it("대표 배지는 일부 핵심 마일스톤에만 부여하고 네 단계가 모두 존재한다", () => {
    const achievements = V2_QUESTS.filter((quest) => quest.points != null);
    const badges = achievements.filter((quest) => quest.badgeTier != null);

    expect(badges.length).toBeGreaterThan(40);
    expect(badges.length).toBeLessThan(achievements.length);
    expect(new Set(badges.map((quest) => quest.badgeTier))).toEqual(
      new Set(["bronze", "silver", "gold", "legendary"]),
    );
    expect(badges.every((quest) => quest.goal != null)).toBe(true);
  });

  it("보상 장비는 카탈로그에 존재(쇠사슬 갑옷 등)", () => {
    for (const q of V2_QUESTS) {
      if (q.reward.equip) {
        expect(V2_EQUIPMENT[q.reward.equip], q.reward.equip).toBeDefined();
      }
    }
  });

  it("영구 업적 300개 이상 + 모든 업적에 점수", () => {
    const achievements = V2_QUESTS.filter((q) => !isTutorialLine(q.line));
    expect(achievements.length).toBeGreaterThanOrEqual(300);
    expect(achievements.every((q) => (q.points ?? 0) > 0)).toBe(true);
  });

  it("마일스톤 체인은 목표가 오름차순이며 한 계열로 연결된다", () => {
    const chains = new Map<string, Array<(typeof V2_QUESTS)[number]>>();
    for (const quest of V2_QUESTS) {
      if (!quest.chain) continue;
      const entries = chains.get(quest.chain) ?? [];
      entries.push(quest);
      chains.set(quest.chain, entries);
    }

    expect(chains.size).toBeGreaterThan(30);
    for (const [chain, entries] of chains) {
      expect(entries.length, chain).toBeGreaterThan(1);
      for (let index = 1; index < entries.length; index += 1) {
        expect(entries[index].goal, `${chain}:${entries[index].id}`).toBeGreaterThan(
          entries[index - 1].goal ?? 0,
        );
      }
    }
  });

  it("몬스터 종수와 숫자형 목표 설명은 올바른 목적격 조사를 사용한다", () => {
    expect(questById("combat_species80")?.desc).toContain("80종을 달성하세요");
    expect(questById("cooking_level10")?.desc).toContain("10을 달성하세요");
    expect(questById("combat_10")?.desc).toContain("10회를 달성하세요");
  });

  it("모든 영구 업적은 골드를 보상으로 지급하지 않는다", () => {
    const achievements = V2_QUESTS.filter((q) => !isTutorialLine(q.line));
    expect(achievements.every((q) => q.reward.gold == null)).toBe(true);
  });

  it("업적 점수는 달성 조건과 과거 수령 기록을 함께 보존", () => {
    const summary = achievementSummary(
      { ...ZERO, battleCount: 100 },
      new Set(["gold_1m"]),
    );
    expect(summary.score).toBe(60); // 전투 10·50·100 = 20점 + 과거 수령 40점
    expect(summary.completed).toBe(4);
    expect(summary.maxScore).toBeGreaterThan(summary.score);
  });

  it("보상 칭호는 카탈로그에 존재", () => {
    const titleRewards = V2_QUESTS.filter((q) => q.reward.titleId);
    expect(titleRewards.length).toBeGreaterThan(0);
    for (const q of titleRewards) {
      expect(TITLES[q.reward.titleId!], `${q.id} title`).toBeDefined();
    }
  });

  it("기초 튜토리얼(basics) 보상 = 스태미나 회복약 2개", () => {
    const basics = V2_QUESTS.filter((q) => q.line === "basics");
    expect(basics.length).toBeGreaterThan(0);
    for (const q of basics) {
      expect(q.reward.staminaPotions, q.id).toBe(2);
      expect(q.reward.gold, q.id).toBeUndefined();
    }
  });

  it("성장의 길(growth) 보상 = 스태미나 회복약 1개(골드 없음)", () => {
    const growth = V2_QUESTS.filter((q) => q.line === "growth");
    expect(growth.length).toBeGreaterThan(0);
    for (const q of growth) {
      expect(q.reward.staminaPotions, q.id).toBe(1);
      expect(q.reward.gold, q.id).toBeUndefined();
    }
    // 첫 발걸음은 회복약과 별개로 쇠사슬 갑옷 유지(다음 "무장하기" 튜토리얼 루프).
    expect(questById("g_first_battle")!.reward.equip).toBe("v2_chain_mail");
  });

  it("튜토리얼 탭 라인 순서 — 기초 튜토리얼이 성장의 길보다 위", () => {
    const tut = QUEST_LINES.filter((l) => l.tutorial).map((l) => l.id);
    expect(tut.indexOf("basics")).toBeGreaterThanOrEqual(0);
    expect(tut.indexOf("basics")).toBeLessThan(tut.indexOf("growth"));
  });

  it("모든 튜토리얼 목표는 실제 기능 화면 바로가기를 제공", () => {
    const tutorialQuests = V2_QUESTS.filter((q) => isTutorialLine(q.line));
    expect(tutorialQuests.length).toBeGreaterThan(0);
    for (const quest of tutorialQuests) {
      expect(quest.href, quest.id).toMatch(/^\//);
    }
  });

  it("직업 차수(class_*) 전용 라인은 제거됨 — 전직 업적은 현재 6차까지 안내", () => {
    expect(QUEST_LINES.some((l) => l.id.startsWith("class_"))).toBe(false);
    expect(V2_QUESTS.some((q) => q.line.startsWith("class_"))).toBe(false);
    expect(questById("g_advance2")!.title + questById("g_advance2")!.desc).toContain(
      "2차",
    );
    expect(questById("g_passive")!.title + questById("g_passive")!.desc).toContain(
      "3차",
    );
    expect(questById("a_apex")!.title + questById("a_apex")!.desc).toContain(
      "4차",
    );
    expect(questById("growth_tier5")!.desc).toContain("5차");
    expect(questById("growth_tier6")!.desc).toContain("6차");
  });

  it("사용자에게 보이는 업적 문구에서 옛 환생·윤회 용어를 제거", () => {
    const visibleCopy = [
      ...QUEST_LINES.flatMap((line) => [line.name, line.subtitle]),
      ...V2_QUESTS.flatMap((quest) => [quest.title, quest.desc]),
    ].join(" ");
    expect(visibleCopy).not.toMatch(/환생|윤회|다시 태어나다/);
  });
});

describe("성장의 길 (순차 라인)", () => {
  it("신규 캐릭터 — 첫 퀘만 active, 나머지는 locked", () => {
    expect(questStatus(questById("g_first_job")!, NEWCOMER, none)).toBe(
      "active",
    );
    expect(questStatus(questById("g_first_battle")!, NEWCOMER, none)).toBe(
      "locked",
    );
    expect(questStatus(questById("g_equip")!, NEWCOMER, none)).toBe("locked");
  });

  it("앞 퀘 조건만 충족하면 뒤 퀘도 동시 수령 가능(수령 순서 강제 안 함)", () => {
    const ctx = {
      ...ZERO,
      level: 10,
      battleCount: 3,
      equippedCount: 6,
      hasManuallyEquippedGear: true,
      hasBattledAfterEquippingGear: true,
    };
    expect(isQuestClaimable(questById("g_first_battle")!, ctx, none)).toBe(true);
    expect(isQuestClaimable(questById("g_equip")!, ctx, none)).toBe(true);
    expect(isQuestClaimable(questById("g_equipped_battle")!, ctx, none)).toBe(
      true,
    );
    expect(isQuestClaimable(questById("g_level10")!, ctx, none)).toBe(true);
    expect(questStatus(questById("g_depth5")!, ctx, none)).toBe("active");
  });

  it("자동 장착 스타터 장비만으로는 장착 튜토리얼이 완료되지 않는다", () => {
    const starterEquipped = { ...ZERO, battleCount: 1, equippedCount: 6 };
    expect(questStatus(questById("g_equip")!, starterEquipped, none)).toBe(
      "active",
    );
    expect(
      isQuestClaimable(
        questById("g_equip")!,
        { ...starterEquipped, hasManuallyEquippedGear: true },
        none,
      ),
    ).toBe(true);
  });

  it("장비를 직접 장착한 뒤 전투해야 다음 전투 단계가 완료된다", () => {
    const equipped = {
      ...ZERO,
      battleCount: 1,
      hasManuallyEquippedGear: true,
    };
    expect(questStatus(questById("g_equipped_battle")!, equipped, none)).toBe(
      "active",
    );
    expect(
      isQuestClaimable(
        questById("g_equipped_battle")!,
        { ...equipped, hasBattledAfterEquippingGear: true },
        none,
      ),
    ).toBe(true);
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

  it("기초 튜토리얼 — 은행/현재 스킬 장착/옛 저장 신호로 충족", () => {
    // 신규(ZERO) = 전부 미충족.
    expect(questStatus(questById("b_bank")!, ZERO, none)).toBe("active");
    expect(questStatus(questById("b_skill")!, ZERO, none)).toBe("active");
    // 각 신호 충족 시 수령 가능.
    expect(
      isQuestClaimable(questById("b_bank")!, { ...ZERO, bankedGold: 50 }, none),
    ).toBe(true);
    expect(
      isQuestClaimable(
        questById("b_skill")!,
        { ...ZERO, hasEditedSkillLoadout: true },
        none,
      ),
    ).toBe(true);
    expect(
      isQuestClaimable(
        questById("b_skill")!,
        { ...ZERO, skillsEquipped: 1 },
        none,
      ),
    ).toBe(true);
  });

  it("기초 튜토리얼 — 상점/치료/학습 신호로 충족", () => {
    expect(questStatus(questById("b_shop")!, ZERO, none)).toBe("active");
    expect(questStatus(questById("b_heal")!, ZERO, none)).toBe("active");
    expect(questStatus(questById("b_learn")!, ZERO, none)).toBe("active");
    expect(
      isQuestClaimable(questById("b_shop")!, { ...ZERO, hasShopped: true }, none),
    ).toBe(true);
    expect(
      isQuestClaimable(questById("b_heal")!, { ...ZERO, hasHealed: true }, none),
    ).toBe(true);
    expect(
      isQuestClaimable(
        questById("b_learn")!,
        { ...ZERO, skillsLearned: 1 },
        none,
      ),
    ).toBe(true);
  });

  it("기초 튜토리얼 — 생활 5종의 첫 성공을 각각 안내하고 판정", () => {
    const lifeTutorials = [
      {
        id: "b_farm",
        href: "/town/farm",
        ctx: { ...ZERO, farmHarvests: 1 },
      },
      {
        id: "b_logging",
        href: "/town/logging?spot=pine_grove",
        ctx: { ...ZERO, woodcuttingCuts: 1 },
      },
      {
        id: "b_mining",
        href: "/town/mining?spot=iron_quarry",
        ctx: { ...ZERO, miningSuccesses: 1 },
      },
      {
        id: "b_fishing",
        href: "/town/fishing",
        ctx: { ...ZERO, fishCaught: 1 },
      },
      {
        id: "b_cooking",
        href: "/town/kitchen",
        ctx: { ...ZERO, cookingDishesCooked: 1 },
      },
    ] as const;

    for (const { id, href, ctx } of lifeTutorials) {
      const quest = questById(id)!;
      expect(quest.line, id).toBe("basics");
      expect(quest.href, id).toBe(href);
      expect(questStatus(quest, ZERO, none), id).toBe("active");
      expect(isQuestClaimable(quest, ctx, none), id).toBe(true);
    }
  });

  it("튜토리얼 라인 플래그 — growth·basics 만 tutorial", () => {
    expect(isTutorialLine("growth")).toBe(true);
    expect(isTutorialLine("basics")).toBe(true);
    expect(isTutorialLine("social")).toBe(false);
    expect(isTutorialLine("enhance")).toBe(false);
    expect(isTutorialLine("unknown_line")).toBe(false);
  });
});

describe("전직 마일스톤 — 목표 차수 노출, 내부 tier 판정 유지", () => {
  it("성장의 길 전직 단계 — tier 게이트(.check)", () => {
    expect(questById("g_advance2")!.check({ ...ZERO, tier: 1 })).toBe(false);
    expect(questById("g_advance2")!.check({ ...ZERO, tier: 2 })).toBe(true);
    expect(questById("g_passive")!.check({ ...ZERO, tier: 2 })).toBe(false);
    expect(questById("g_passive")!.check({ ...ZERO, tier: 3 })).toBe(true);
  });

  it("튜토리얼 전직 단계 title/desc 에 2차·3차 전직을 명시", () => {
    const second = questById("g_advance2")!;
    const third = questById("g_passive")!;
    expect(`${second.title} ${second.desc}`).toContain("2차 전직");
    expect(`${third.title} ${third.desc}`).toContain("3차 전직");
  });

  it("재전직 직후 전직 퀘스트가 잠기지 않음 — 레벨 리셋 회귀", () => {
    // 정점(레벨캡)을 찍고 재전직한 직후. 현재 레벨은 1로 리셋되지만
    // cumLevel 은 보존된다(100). 앞 성장 단계 조건은 모두 충족된 상태.
    const afterReincarnate: QuestCtx = {
      ...ZERO,
      level: 1, // 재전직으로 리셋됨(과거 버그의 방아쇠)
      cumLevel: 100, // 보존 — 정점 조건은 숙련도 기준이라 유지
      tier: 2,
      battleCount: 5,
      equippedCount: 6,
      hasManuallyEquippedGear: true,
      hasBattledAfterEquippingGear: true,
      frontierDepth: 7,
      cultivations: 1,
    };
    // 정점은 숙련도 기준이라 재전직 후에도 충족(현재 레벨 기준이면 false 였음).
    expect(questById("g_cap1")!.check(afterReincarnate)).toBe(true);
    // 따라서 전직 퀘스트는 locked 가 아니라 조건이 노출되고 수령 가능해야 한다.
    expect(questStatus(questById("g_advance2")!, afterReincarnate, none)).toBe(
      "claimable",
    );
    expect(
      isQuestClaimable(questById("g_advance2")!, afterReincarnate, none),
    ).toBe(true);
  });

  it("정점 퀘스트는 현재 레벨 만렙도 인정한다", () => {
    expect(
      questById("g_cap1")!.check({
        ...ZERO,
        level: V2_LEVEL_CAP,
        cumLevel: 0,
      }),
    ).toBe(true);
  });

  it("수령된 앞 단계는 조건이 다시 거짓이 돼도 뒤 단계를 안 잠금 — 보강", () => {
    // 정점(g_cap1)을 수령한 뒤 그 조건이 다시 거짓인 합성 상태라도, 수령 사실 덕에
    // 전직 단계가 열린 채로 유지된다(순차 해금이 claimed 도 충족으로 인정).
    const claimed = new Set([
      "g_first_battle",
      "g_equip",
      "g_equipped_battle",
      "g_level10",
      "g_depth5",
      "g_frontier",
      "g_cap1",
      "g_first_job",
      "g_cultivate",
    ]);
    const ctx: QuestCtx = {
      ...ZERO,
      level: 1,
      cumLevel: 50, // 정점 조건(>=100) 미충족이지만 이미 수령됨
      tier: 2,
    };
    expect(questById("g_cap1")!.check(ctx)).toBe(false);
    expect(questStatus(questById("g_advance2")!, ctx, claimed)).toBe(
      "claimable",
    );
  });

  it("정점(a_apex) — tier 4 에서 수령 가능, 그전엔 진행 중", () => {
    expect(isQuestClaimable(questById("a_apex")!, { ...ZERO, tier: 4 }, none)).toBe(
      true,
    );
    expect(questStatus(questById("a_apex")!, { ...ZERO, tier: 3 }, none)).toBe(
      "active",
    );
  });

  it("classOnly 메커니즘은 보존하되 사용하는 라인 데이터는 없음", () => {
    expect(QUEST_LINES.every((l) => !l.classOnly)).toBe(true);
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
  it("유니크 수집 / 깊이 40(체인 — 앞 단계 수령 후) / 보스 / 고차수", () => {
    expect(
      isQuestClaimable(questById("a_unique")!, { ...ZERO, uniqueOwned: 1 }, none),
    ).toBe(true);
    // 체인 중간 단계는 앞 목표를 전부 수령하기 전에는 건너뛸 수 없다.
    expect(
      isQuestClaimable(
        questById("a_depth40")!,
        { ...ZERO, frontierDepth: 40 },
        none,
      ),
    ).toBe(false);
    expect(
      isQuestClaimable(
        questById("a_depth40")!,
        { ...ZERO, frontierDepth: 40 },
        new Set([
          "b_band_canyon",
          "frontier_13",
          "a_depth25",
          "frontier_25",
          "b_band_swamp",
        ]),
      ),
    ).toBe(true);
    expect(
      isQuestClaimable(questById("a_boss")!, { ...ZERO, bossKills: 1 }, none),
    ).toBe(true);
    expect(
      isQuestClaimable(questById("a_apex")!, { ...ZERO, tier: 4 }, none),
    ).toBe(true);
  });

  it("체인 간 독립 — 깊이 체인 진행이 보스 체인과 무관", () => {
    const claimed = new Set([
      "b_band_canyon",
      "frontier_13",
      "a_depth25",
      "frontier_25",
      "b_band_swamp",
    ]);
    const ctx = { ...ZERO, frontierDepth: 40 };
    expect(isQuestClaimable(questById("a_depth40")!, ctx, claimed)).toBe(true);
    expect(questStatus(questById("a_boss")!, ctx, claimed)).toBe("active");
  });

  it("배치2 정점 — 보스 마스터(4종)·유니크 5(각 체인 앞 단계 수령 후)", () => {
    expect(
      isQuestClaimable(
        questById("a_boss_master")!,
        { ...ZERO, bossKills: 4 },
        new Set(["a_boss", "combat_boss2"]),
      ),
    ).toBe(true);
    // 보스 3종만으론 미충족(공허의 대사제 포함 4종 기준).
    expect(
      questStatus(
        questById("a_boss_master")!,
        { ...ZERO, bossKills: 3 },
        new Set(["a_boss", "combat_boss2"]),
      ),
    ).toBe("active");
    expect(
      isQuestClaimable(
        questById("a_unique5")!,
        { ...ZERO, uniqueOwned: 5 },
        new Set(["a_unique"]),
      ),
    ).toBe(true);
    const beforeFrontierEnd = new Set([
      "b_band_canyon",
      "frontier_13",
      "a_depth25",
      "frontier_25",
      "b_band_swamp",
      "a_depth40",
      "frontier_48",
      "frontier_60",
    ]);
    // 깊이 체인 마지막 — 앞 단계를 모두 수령한 뒤 수령 가능.
    expect(
      isQuestClaimable(
        questById("a_depth48")!,
        { ...ZERO, frontierDepth: 71 },
        beforeFrontierEnd,
      ),
    ).toBe(false);
    expect(
      isQuestClaimable(
        questById("a_depth48")!,
        { ...ZERO, frontierDepth: 72 },
        beforeFrontierEnd,
      ),
    ).toBe(true);
  });
});

describe("장비·수집·교류 업적", () => {
  it("완전 무장 / 장비 도감 / 지갑+은행 골드 / 칭호", () => {
    expect(isQuestClaimable(questById("x_full_gear")!, { ...ZERO, equippedCount: 6 }, none)).toBe(true);
    expect(questStatus(questById("x_full_gear")!, { ...ZERO, equippedCount: 5 }, none)).toBe("active");
    expect(isQuestClaimable(questById("codex_10")!, { ...ZERO, equipmentCodexRegistered: 10 }, none)).toBe(true);
    expect(isQuestClaimable(questById("x_rich")!, { ...ZERO, gold: 4_000, bankedGold: 6_000 }, none)).toBe(true);
    expect(isQuestClaimable(questById("x_titles")!, { ...ZERO, titleCount: 3 }, none)).toBe(true);
  });

  it("부와 명예 2,500만 골드는 지갑과 은행 잔액을 합산한다", () => {
    const quest = questById("marathon_gold_25000000")!;
    const exact = { ...ZERO, gold: 5_000_000, bankedGold: 20_000_000 };
    const priorGoldMilestones = new Set([
      "x_rich",
      "gold_100k",
      "gold_1m",
      "marathon_gold_5000000",
      "marathon_gold_10000000",
    ]);
    expect(quest.progress?.(exact)).toBe(25_000_000);
    expect(isQuestClaimable(quest, exact, priorGoldMilestones)).toBe(true);
    expect(
      questStatus(
        quest,
        { ...ZERO, gold: 4_999_999, bankedGold: 20_000_000 },
        none,
      ),
    ).toBe("active");
  });

  it("투기장 승리 — arenaWins 기반(플레이만으론 미충족)", () => {
    expect(isQuestClaimable(questById("s_arena_win")!, { ...ZERO, arenaWins: 1 }, none)).toBe(true);
    expect(questStatus(questById("s_arena_win")!, { ...ZERO, arenaPlayed: true }, none)).toBe("active");
  });

  it("장비 업적은 전 직군 공통(직업 전용 아님)", () => {
    const mage = { ...ZERO, class: "mage" as const };
    const lines = deriveQuestViews(mage, none).map((v) => v.line);
    expect(lines).toContain("equipment");
  });
});

describe("currentGuideQuest (홈 배너)", () => {
  it("신규 캐릭터 — 첫 퀘(active) 안내", () => {
    expect(currentGuideQuest(NEWCOMER, none)?.id).toBe("g_first_job");
  });

  it("수령 가능한 마일스톤이 진행 중 퀘보다 우선(라인 순서 무관)", () => {
    // 성장의 길은 전부 수령. 길드 가입 신호만 충족 → 기초 튜토리얼(진행 중)을 건너뛰고
    // 모험가의 길 '길드의 일원'(수령 가능)이 현재 목표로 안내된다.
    const ctx: QuestCtx = {
      ...ZERO,
      level: 60,
      tier: 2,
      battleCount: 99,
      frontierDepth: 6, // 7 미만 — b_band_canyon(도감) claimable 방지
      equippedCount: 1, // 6 미만 — x_full_gear(수집) claimable 방지
      cultivations: 2,
      hasGuild: true,
    };
    const growthClaimed = new Set(
      V2_QUESTS.filter((q) => q.line === "growth").map((q) => q.id),
    );
    const cur = currentGuideQuest(ctx, growthClaimed);
    expect(cur?.id).toBe("combat_10");
    expect(cur?.line).toBe("combat");
  });

  it("사용자가 추적한 진행 중 업적을 자동 추천보다 우선하고 완료되면 자동 추천으로 돌아간다", () => {
    expect(currentGuideQuest(ZERO, none, "x_rich")?.id).toBe("x_rich");

    const claimed = new Set(["x_rich"]);
    expect(currentGuideQuest(ZERO, claimed, "x_rich")?.id).not.toBe("x_rich");
  });

  it("전부 수령 → null", () => {
    const ctx: QuestCtx = {
      class: "warrior",
      level: 100,
      tier: 4,
      battleCount: 999,
      frontierDepth: 72,
      equippedCount: 6,
      hasManuallyEquippedGear: true,
      hasBattledAfterEquippingGear: true,
      uniqueOwned: 5,
      cultivations: 9,
      bossKills: 4,
      hasGuild: true,
      hasTraded: true,
      arenaPlayed: true,
      arenaWins: 3,
      gold: 20000,
      outpostsDiscovered: 20,
      titleCount: 5,
      cumLevel: 2500,
      reincarnations: 9,
      speciesKilled: 41,
      fishSpecies: 30,
      maxEnhanceLevel: 10,
      enhanceStones: 99,
      bankedGold: 99999,
      skillsEquipped: 5,
      skillsLearned: 5,
      hasEditedSkillLoadout: true,
      hasHealed: true,
      hasShopped: true,
      workshopCrafts: 9,
      workshopQualityCrafts: 1,
      blacksmithLevel: 3,
      farmingLevel: 50,
      farmHarvests: 999,
      farmRareHarvests: 999,
      farmDeliveries: 999,
      farmReputationEarned: 999,
      woodcuttingLevel: 50,
      woodcuttingCuts: 9999,
      woodcuttingSpecies: 99,
      miningLevel: 50,
      miningSuccesses: 9999,
      miningByproducts: 999,
      miningSpecies: 99,
      fishingLevel: 50,
      fishCaught: 9999,
      equipmentCodexRegistered: 240,
      equipmentCodexTotal: 240,
      masteryTowerFloor: 50,
      cookingLevel: 50,
      cookingRecipesDiscovered: 18,
      cookingDishesCooked: 9999,
      cookingOrdersCompleted: 999,
      cookingMasterpiecesCooked: 999,
      cookingRareIngredientDishes: 999,
      guildDiningMeals: 50,
      guildTrainingDrills: 50,
      guildExpeditions: 20,
      guildWorkshopDeliveries: 50,
      guildAlchemyCrafts: 25,
      guildTradeContracts: 25,
    };
    const all = new Set(V2_QUESTS.map((q) => q.id));
    expect(currentGuideQuest(ctx, all)).toBeNull();
  });
});

describe("deriveQuestViews", () => {
  const speciesThrough60 = new Set([
    "combat_species5",
    "b_species15",
    "combat_species25",
    "b_species35",
    "combat_species40",
    "combat_species60",
  ]);

  it("현재 60종을 넘는 몬스터 업적은 미달성 이용자에게 숨긴다", () => {
    const views = deriveQuestViews(
      { ...ZERO, speciesKilled: 60 },
      speciesThrough60,
    );
    const ids = views.map((view) => view.id);

    expect(ids).not.toContain("combat_species80");
    expect(ids).not.toContain("combat_species95");
  });

  it("과거 기록으로 80종을 채운 이용자는 끝없는 추적 수령 권리를 유지한다", () => {
    const views = deriveQuestViews(
      { ...ZERO, speciesKilled: 80 },
      speciesThrough60,
    );
    const endlessTracking = views.find(
      (view) => view.id === "combat_species80",
    );

    expect(endlessTracking).toMatchObject({
      status: "claimable",
      progress: 80,
      goal: 80,
      detailKind: "monster_codex",
    });
    expect(views.map((view) => view.id)).not.toContain("combat_species95");
  });

  it("과거에 수령한 80종 업적은 진행 수치와 무관하게 완료 목록과 점수에 남는다", () => {
    const claimed = new Set([...speciesThrough60, "combat_species80"]);
    const views = deriveQuestViews(ZERO, claimed);
    const summary = achievementSummary(ZERO, claimed);

    expect(views.find((view) => view.id === "combat_species80")?.status).toBe(
      "claimed",
    );
    expect(summary.score).toBeGreaterThanOrEqual(60);
  });

  it("현 직군 가시 + 체인 현재 단계만 (숨김 단계 제외)", () => {
    const views = deriveQuestViews(ZERO, none);
    // 직군 가시 퀘 중, 체인은 첫 단계만 보임(미수령 상태 기준).
    const seenChains = new Set<string>();
    const visibleCount = V2_QUESTS.filter((q) => {
      if (!q.chain) return true;
      if (seenChains.has(q.chain)) return false;
      seenChains.add(q.chain);
      return true;
    }).length;
    expect(views).toHaveLength(visibleCount);
    expect(views.every((v) => v.status)).toBe(true);
  });

  it("업적 마일스톤은 현재 단계만 보이며 수령분은 완료로 잔존", () => {
    const fresh = deriveQuestViews(ZERO, none).map((v) => v.id);
    expect(fresh).toContain("l_fish1");
    expect(fresh).not.toContain("l_fish10");
    // l_fish1 수령 → l_fish10 등장(+수령분 완료 표시), l_fish25 는 여전히 숨김.
    const after = deriveQuestViews(
      { ...ZERO, fishSpecies: 12 },
      new Set(["l_fish1"]),
    );
    const ids = after.map((v) => v.id);
    expect(ids).toContain("l_fish10");
    expect(ids).not.toContain("l_fish25");
    expect(after.find((v) => v.id === "l_fish1")!.status).toBe("claimed");
    expect(after.find((v) => v.id === "l_fish10")!.status).toBe("claimable");
  });

  it("작물 수확 50회 수령 뒤 다음 단계인 계절을 일구다만 공개", () => {
    const views = deriveQuestViews(
      { ...ZERO, farmHarvests: 50 },
      new Set(["farm_harvest1", "farm_harvest10", "farm_harvest50"]),
    );
    const ids = views.map((view) => view.id);

    expect(ids).toContain("farm_harvest200");
    expect(ids).not.toContain("farm_harvest500");
    expect(views.find((view) => view.id === "farm_harvest200")!.status).toBe(
      "active",
    );
  });

  it("과거 독립 수령 세이브 — 상위만 수령돼 있어도 안전(하위가 현재 단계)", () => {
    const views = deriveQuestViews(
      { ...ZERO, battleCount: 6000 },
      new Set(["b_battles5000"]),
    );
    const ids = views.map((v) => v.id);
    expect(ids).toContain("combat_10"); // 가장 이른 미수령 단계가 현재 목표
    expect(ids).toContain("b_battles5000"); // 수령분은 완료 탭 잔존
    expect(views.find((v) => v.id === "combat_10")!.status).toBe("claimable");
  });
});

describe("확장 라인(재전직/생활/도감) 판정", () => {
  it("재전직 기록 — 첫 업적은 재전직 1회로 판정(숙련도 무관)", () => {
    // 한 직업 숙련도만으로 행동을 추측하지 않고 실제 재전직 카운터로 판정한다.
    expect(
      questById("r_first")!.check({ ...ZERO, reincarnations: 0, cumLevel: 100 }),
    ).toBe(false);
    expect(
      questById("r_first")!.check({ ...ZERO, reincarnations: 1, cumLevel: 99 }),
    ).toBe(true);
  });

  it("직업 숙련도 — 장기 마일스톤 경계", () => {
    expect(questById("r_300")!.check({ ...ZERO, cumLevel: 449 })).toBe(false);
    expect(questById("r_300")!.check({ ...ZERO, cumLevel: 450 })).toBe(true);
    expect(questById("r_2000")!.check({ ...ZERO, cumLevel: 3000 })).toBe(true);
  });

  it("생활의 달인 — 도감 카운트", () => {
    expect(questById("l_fish25")!.check({ ...ZERO, fishSpecies: 24 })).toBe(false);
    expect(questById("l_fish25")!.check({ ...ZERO, fishSpecies: 25 })).toBe(true);
  });

  it("토벌 도감 — 종 수·밴드·누적 전투", () => {
    expect(questById("b_species35")!.check({ ...ZERO, speciesKilled: 35 })).toBe(true);
    expect(questById("b_band_swamp")!.check({ ...ZERO, frontierDepth: 31 })).toBe(true);
    expect(questById("b_battles5000")!.check({ ...ZERO, battleCount: 5000 })).toBe(true);
  });
});

describe("오늘 추가된 요리·길드 시설 업적", () => {
  it("요리 레벨과 발견한 요리법 마일스톤", () => {
    expect(questById("cooking_level10")!.check({ ...ZERO, cookingLevel: 9 })).toBe(false);
    expect(questById("cooking_level10")!.check({ ...ZERO, cookingLevel: 10 })).toBe(true);
    expect(
      questById("cooking_recipe18")!.check({
        ...ZERO,
        cookingRecipesDiscovered: COOKING_RECIPES.length - 1,
      }),
    ).toBe(false);
    expect(
      questById("cooking_recipe18")!.check({
        ...ZERO,
        cookingRecipesDiscovered: COOKING_RECIPES.length,
      }),
    ).toBe(true);
  });

  it("완성·의뢰·걸작·희귀 재료 요리를 별도 마일스톤으로 추적한다", () => {
    expect(
      questById("cooking_dish500")!.check({
        ...ZERO,
        cookingDishesCooked: 500,
      }),
    ).toBe(true);
    expect(
      questById("cooking_order100")!.check({
        ...ZERO,
        cookingOrdersCompleted: 99,
      }),
    ).toBe(false);
    expect(
      questById("cooking_masterpiece25")!.check({
        ...ZERO,
        cookingMasterpiecesCooked: 25,
      }),
    ).toBe(true);
    expect(
      questById("cooking_rare250")!.check({
        ...ZERO,
        cookingRareIngredientDishes: 250,
      }),
    ).toBe(true);
  });

  it("식당·훈련·원정·납품·연금·교역 누적 마일스톤", () => {
    expect(questById("guild_dining10")!.check({ ...ZERO, guildDiningMeals: 10 })).toBe(true);
    expect(questById("guild_training10")!.check({ ...ZERO, guildTrainingDrills: 10 })).toBe(true);
    expect(questById("guild_expedition5")!.check({ ...ZERO, guildExpeditions: 5 })).toBe(true);
    expect(questById("guild_delivery10")!.check({ ...ZERO, guildWorkshopDeliveries: 10 })).toBe(true);
    expect(questById("guild_alchemy25")!.check({ ...ZERO, guildAlchemyCrafts: 25 })).toBe(true);
    expect(questById("guild_trade25")!.check({ ...ZERO, guildTradeContracts: 25 })).toBe(true);
  });
});

describe("강화의 길 판정", () => {
  it("첫 단조/돌 보유/레벨 마일스톤 경계", () => {
    expect(questById("e_first")!.check(ZERO)).toBe(false);
    expect(questById("e_first")!.check({ ...ZERO, maxEnhanceLevel: 1 })).toBe(true);
    expect(questById("e_stone")!.check({ ...ZERO, enhanceStones: 1 })).toBe(true);
    expect(questById("e_plus7")!.check({ ...ZERO, maxEnhanceLevel: 6 })).toBe(false);
    expect(questById("e_plus10")!.check({ ...ZERO, maxEnhanceLevel: 10 })).toBe(true);
  });
});

describe("장인의 길 판정", () => {
  it("제작 횟수/대장장이 레벨/품질 제작", () => {
    expect(questById("a_first_craft")!.check(ZERO)).toBe(false);
    expect(
      questById("a_first_craft")!.check({ ...ZERO, workshopCrafts: 1 }),
    ).toBe(true);
    expect(questById("a_blacksmith_lv2")!.check(ZERO)).toBe(false);
    expect(
      questById("a_blacksmith_lv2")!.check({ ...ZERO, blacksmithLevel: 2 }),
    ).toBe(true);
    expect(questById("a_quality_plus1")!.check(ZERO)).toBe(false);
    expect(
      questById("a_quality_plus1")!.check({
        ...ZERO,
        workshopQualityCrafts: 1,
      }),
    ).toBe(true);
  });
});
