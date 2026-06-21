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
    expect(
      isQuestClaimable(
        questById("b_travel")!,
        { ...ZERO, outpostsDiscovered: 2 },
        none,
      ),
    ).toBe(true);
    // 거점 1곳(시작 거점 시드 가능)만으론 이동 퀘 미충족.
    expect(
      isQuestClaimable(
        questById("b_travel")!,
        { ...ZERO, outpostsDiscovered: 1 },
        none,
      ),
    ).toBe(false);
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

  it("직업 차수 진행 — 2차 전직 → 3차 → 4차", () => {
    const t2 = { ...ZERO, tier: 2 };
    expect(isQuestClaimable(questById("c_warrior_spec")!, t2, none)).toBe(true);
    expect(questStatus(questById("c_warrior_deepen")!, t2, none)).toBe(
      "active",
    );
    const t3 = { ...ZERO, tier: 3 };
    expect(isQuestClaimable(questById("c_warrior_deepen")!, t3, none)).toBe(
      true,
    );
    const t4 = { ...ZERO, tier: 4 };
    expect(isQuestClaimable(questById("c_warrior_apex")!, t4, none)).toBe(true);
  });

  it("교차 직군 수령 차단 — 전사가 2차여도 class_mage 퀘 수령 불가", () => {
    const t2 = { ...ZERO, tier: 2 };
    expect(isQuestClaimable(questById("c_mage_spec")!, t2, none)).toBe(false);
    // 마법사면 반대로 가능.
    const mageT2 = { ...t2, class: "mage" as const };
    expect(isQuestClaimable(questById("c_mage_spec")!, mageT2, none)).toBe(
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

  it("배치2 정점 — 보스 마스터(3종)·유니크 5(각 체인 앞 단계 수령 후)", () => {
    expect(
      isQuestClaimable(
        questById("a_boss_master")!,
        { ...ZERO, bossKills: 3 },
        new Set(["a_boss"]),
      ),
    ).toBe(true);
    // 보스 1종만으론 미충족.
    expect(
      questStatus(questById("a_boss_master")!, { ...ZERO, bossKills: 1 }, new Set(["a_boss"])),
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

  it("성장의 길 전부 수령 후 — 직업 라인으로 넘어감(라인 우선순위)", () => {
    const ctx: QuestCtx = {
      ...ZERO,
      level: 60,
      tier: 2,
      battleCount: 99,
      frontierDepth: 6, // 7 미만 — b_band_canyon(도감) claimable 방지(라인 우선순위 검증용)
      equippedCount: 1, // 6 미만 — x_full_gear(수집) 이 claimable 안 되게(라인 우선순위 검증용)
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
      battleCount: 999,
      frontierDepth: 48,
      equippedCount: 6,
      uniqueOwned: 5,
      cultivations: 9,
      bossKills: 3,
      hasGuild: true,
      hasTraded: true,
      arenaPlayed: true,
      arenaWins: 3,
      gold: 20000,
      outpostsDiscovered: 20,
      titleCount: 5,
      cumLevel: 2500,
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
      if (q.line.startsWith("class_") && q.line !== "class_warrior") return false;
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

  it("윤회의 길 — 누적레벨 경계 (첫 환생 = 101)", () => {
    expect(questById("r_first")!.check({ ...ZERO, cumLevel: 100 })).toBe(false);
    expect(questById("r_first")!.check({ ...ZERO, cumLevel: 101 })).toBe(true);
    expect(questById("r_2000")!.check({ ...ZERO, cumLevel: 2000 })).toBe(true);
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
