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
  type QuestCtx,
} from "./v2Quests";
import { V2_EQUIPMENT } from "./v2Equipment";
import { V2_LEVEL_CAP } from "./coreLoopConfig";
import { TITLES } from "../titles";

// 신규 캐릭터 기준(전사, 아무것도 안 함). 부분 ctx 는 이걸 스프레드.
const ZERO: QuestCtx = {
  class: "warrior",
  level: 1,
  tier: 1,
  battleCount: 0,
  frontierDepth: 2,
  equippedCount: 0,
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
  claimAttempted: false,
  hasOutpost: false,
  siegeWins: 0,
  warCaptures: 0,
  warEjectWins: 0,
  warTreasuryGold: 0,
  fishSpecies: 0,
  antiquesFound: 0,
  maxEnhanceLevel: 0,
  enhanceStones: 0,
  bankedGold: 0,
  skillsEquipped: 0,
  skillsLearned: 0,
  hasHealed: false,
  hasShopped: false,
  hasMoved: false,
  workshopCrafts: 0,
  workshopQualityCrafts: 0,
  blacksmithLevel: 1,
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

  it("직업 차수(class_*) 전용 라인은 제거됨 — 전직 퀘스트가 목표 차수를 직접 안내", () => {
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

  it("기초 튜토리얼 — 은행/스킬/이동 신호로만 충족(신규는 미충족)", () => {
    // 신규(ZERO) = 전부 미충족.
    expect(questStatus(questById("b_bank")!, ZERO, none)).toBe("active");
    expect(questStatus(questById("b_skill")!, ZERO, none)).toBe("active");
    expect(questStatus(questById("b_travel")!, ZERO, none)).toBe("active");
    // 각 신호 충족 시 수령 가능.
    expect(
      isQuestClaimable(questById("b_bank")!, { ...ZERO, bankedGold: 50 }, none),
    ).toBe(true);
    expect(
      isQuestClaimable(
        questById("b_skill")!,
        { ...ZERO, skillsEquipped: 1 },
        none,
      ),
    ).toBe(true);
    // 지도에서 한 번이라도 이동했으면(hasMoved) 완료. 거점 수와 무관(자유 타일).
    expect(
      isQuestClaimable(
        questById("b_travel")!,
        { ...ZERO, hasMoved: true },
        none,
      ),
    ).toBe(true);
    // 아직 이동 전이면 미충족.
    expect(
      isQuestClaimable(
        questById("b_travel")!,
        { ...ZERO, hasMoved: false },
        none,
      ),
    ).toBe(false);
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

  it("재전직 직후 전직 퀘스트가 잠기지 않음 — 환생 레벨 리셋 회귀", () => {
    // 정점(레벨캡)을 찍고 재전직한 직후. 환생이 현재 레벨을 1로 리셋하지만
    // cumLevel 은 보존된다(100). 앞 성장 단계 조건은 모두 충족된 상태.
    const afterReincarnate: QuestCtx = {
      ...ZERO,
      level: 1, // 환생으로 리셋됨(과거 버그의 방아쇠)
      cumLevel: 100, // 보존 — 정점 조건은 숙련도 기준이라 유지
      tier: 2,
      battleCount: 5,
      equippedCount: 6,
      frontierDepth: 6,
      cultivations: 1,
    };
    // 정점은 숙련도 기준이라 환생 후에도 충족(현재 레벨 기준이면 false 였음).
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
      "g_depth5",
      "g_cultivate",
      "g_cap1",
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
    // 깊이 체인 — a_depth25 수령 전엔 a_depth40 수령 불가, 수령 후 가능.
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
        new Set(["a_depth25"]),
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
    const claimed = new Set(["a_depth25"]);
    const ctx = { ...ZERO, frontierDepth: 40 };
    expect(isQuestClaimable(questById("a_depth40")!, ctx, claimed)).toBe(true);
    expect(questStatus(questById("a_boss")!, ctx, claimed)).toBe("active");
  });

  it("배치2 정점 — 보스 마스터(4종)·유니크 5(각 체인 앞 단계 수령 후)", () => {
    expect(
      isQuestClaimable(
        questById("a_boss_master")!,
        { ...ZERO, bossKills: 4 },
        new Set(["a_boss"]),
      ),
    ).toBe(true);
    // 보스 3종만으론 미충족(공허의 대사제 포함 4종 기준).
    expect(
      questStatus(questById("a_boss_master")!, { ...ZERO, bossKills: 3 }, new Set(["a_boss"])),
    ).toBe("active");
    expect(
      isQuestClaimable(
        questById("a_unique5")!,
        { ...ZERO, uniqueOwned: 5 },
        new Set(["a_unique"]),
      ),
    ).toBe(true);
    // 깊이 체인 마지막 — 앞 두 단계 수령 후 수령 가능.
    expect(
      isQuestClaimable(
        questById("a_depth48")!,
        { ...ZERO, frontierDepth: 48 },
        new Set(["a_depth25", "a_depth40"]),
      ),
    ).toBe(true);
  });
});

describe("배치2 — 수집과 탐험 + 사회 추가", () => {
  it("완전 무장 / 거점 / 골드 / 칭호", () => {
    expect(isQuestClaimable(questById("x_full_gear")!, { ...ZERO, equippedCount: 6 }, none)).toBe(true);
    expect(questStatus(questById("x_full_gear")!, { ...ZERO, equippedCount: 5 }, none)).toBe("active");
    expect(isQuestClaimable(questById("x_outposts")!, { ...ZERO, outpostsDiscovered: 10 }, none)).toBe(true);
    expect(isQuestClaimable(questById("x_rich")!, { ...ZERO, gold: 10000 }, none)).toBe(true);
    expect(isQuestClaimable(questById("x_titles")!, { ...ZERO, titleCount: 3 }, none)).toBe(true);
  });

  it("투기장 승리 — arenaWins 기반(플레이만으론 미충족)", () => {
    expect(isQuestClaimable(questById("s_arena_win")!, { ...ZERO, arenaWins: 1 }, none)).toBe(true);
    expect(questStatus(questById("s_arena_win")!, { ...ZERO, arenaPlayed: true }, none)).toBe("active");
  });

  it("수집과 탐험은 전 직군 공통(직업 전용 아님)", () => {
    const mage = { ...ZERO, class: "mage" as const };
    const lines = deriveQuestViews(mage, none).map((v) => v.line);
    expect(lines).toContain("collect");
  });
});

describe("currentGuideQuest (홈 배너)", () => {
  it("신규 캐릭터 — 첫 퀘(active) 안내", () => {
    expect(currentGuideQuest(ZERO, none)?.id).toBe("g_first_battle");
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
    expect(cur?.id).toBe("s_guild");
    expect(cur?.line).toBe("social");
  });

  it("전부 수령 → null", () => {
    const ctx: QuestCtx = {
      class: "warrior",
      level: 100,
      tier: 4,
      battleCount: 999,
      frontierDepth: 48,
      equippedCount: 6,
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
      claimAttempted: true,
      hasOutpost: true,
      siegeWins: 9,
      warCaptures: 9,
      warEjectWins: 3,
      warTreasuryGold: 99999,
      fishSpecies: 30,
      antiquesFound: 24,
      maxEnhanceLevel: 10,
      enhanceStones: 99,
      bankedGold: 99999,
      skillsEquipped: 5,
      skillsLearned: 5,
      hasHealed: true,
      hasShopped: true,
      hasMoved: true,
      workshopCrafts: 9,
      workshopQualityCrafts: 1,
      blacksmithLevel: 3,
    };
    const all = new Set(V2_QUESTS.map((q) => q.id));
    expect(currentGuideQuest(ctx, all)).toBeNull();
  });
});

describe("deriveQuestViews", () => {
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

  it("체인 — 앞 단계 수령 시 다음 단계 등장, 수령분은 완료로 잔존", () => {
    // 미수령: l_fish10/25 숨김.
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

  it("과거 독립 수령 세이브 — 상위만 수령돼 있어도 안전(하위가 현재 단계)", () => {
    const views = deriveQuestViews(
      { ...ZERO, battleCount: 6000 },
      new Set(["b_battles5000"]),
    );
    const ids = views.map((v) => v.id);
    expect(ids).toContain("b_battles1000"); // 하위 = 현재 단계(claimable)
    expect(ids).toContain("b_battles5000"); // 수령분은 완료 탭 잔존
    expect(views.find((v) => v.id === "b_battles1000")!.status).toBe("claimable");
  });
});

describe("확장 라인(전쟁/윤회/생활/도감) 판정", () => {
  it("전쟁의 길 — 순차 진행 + 신호별 충족", () => {
    expect(questById("w_first_claim")!.check(ZERO)).toBe(false);
    expect(questById("w_first_claim")!.check({ ...ZERO, claimAttempted: true })).toBe(true);
    // 보유 OR 함락 누적 어느 쪽이든 "깃발을 꽂다" 충족.
    expect(questById("w_hold")!.check({ ...ZERO, hasOutpost: true })).toBe(true);
    expect(questById("w_hold")!.check({ ...ZERO, warCaptures: 1 })).toBe(true);
    expect(questById("w_treasury")!.check({ ...ZERO, warTreasuryGold: 2999 })).toBe(false);
    expect(questById("w_treasury")!.check({ ...ZERO, warTreasuryGold: 3000 })).toBe(true);
    // 순차 라인 — 앞(첫 출정) 미완료면 뒤는 locked.
    expect(questStatus(questById("w_hold")!, { ...ZERO, hasOutpost: true }, none)).toBe("locked");
  });

  it("윤회의 길 — 첫 퀘스트는 환생 1회로 판정(숙련도 무관)", () => {
    // 한 생애 숙련도(~99)는 환생 직후 101 문턱 아래라, cumLevel 임계로는 같은 직업
    // 재전직만으로 안 깨지던 사각지대가 있었다. 이제 환생 횟수(행동)로 판정한다.
    expect(
      questById("r_first")!.check({ ...ZERO, reincarnations: 0, cumLevel: 100 }),
    ).toBe(false);
    expect(
      questById("r_first")!.check({ ...ZERO, reincarnations: 1, cumLevel: 99 }),
    ).toBe(true);
  });

  it("윤회의 길 — 후속 마일스톤은 숙련도 경계", () => {
    expect(questById("r_300")!.check({ ...ZERO, cumLevel: 449 })).toBe(false);
    expect(questById("r_300")!.check({ ...ZERO, cumLevel: 450 })).toBe(true);
    expect(questById("r_2000")!.check({ ...ZERO, cumLevel: 3000 })).toBe(true);
  });

  it("생활의 달인 — 도감 카운트", () => {
    expect(questById("l_fish25")!.check({ ...ZERO, fishSpecies: 24 })).toBe(false);
    expect(questById("l_fish25")!.check({ ...ZERO, fishSpecies: 25 })).toBe(true);
    expect(questById("l_antique20")!.check({ ...ZERO, antiquesFound: 20 })).toBe(true);
  });

  it("토벌 도감 — 종 수·밴드·누적 전투", () => {
    expect(questById("b_species35")!.check({ ...ZERO, speciesKilled: 35 })).toBe(true);
    expect(questById("b_band_swamp")!.check({ ...ZERO, frontierDepth: 31 })).toBe(true);
    expect(questById("b_battles5000")!.check({ ...ZERO, battleCount: 5000 })).toBe(true);
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
