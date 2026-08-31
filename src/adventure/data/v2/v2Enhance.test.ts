import { describe, expect, it } from "vitest";
import {
  ENHANCE_LEVEL_BONUS_CUM,
  ENHANCE_OUTCOME_TABLE,
  demoteEnhance,
  enhanceBonusPct,
  enhancedPower,
  enhanceGoldCost,
  enhanceOutcomeRow,
  enhanceStoneCost,
  parseEnhance,
  rollEnhanceOutcome,
} from "./v2Enhance";
import {
  parseEquipmentSave,
  powerWithBonuses,
  resolveEquippedForAggregate,
  type V2EquipmentId,
} from "./v2Equipment";

describe("구간 보너스 (레벨 기반·확실한 리턴)", () => {
  it("누적표 — +10=24% +12=34%(옛 +10) +20=69%", () => {
    expect(enhanceBonusPct(5)).toBe(8);
    expect(enhanceBonusPct(7)).toBe(12);
    expect(enhanceBonusPct(9)).toBe(18);
    expect(enhanceBonusPct(10)).toBe(24);
    expect(enhanceBonusPct(12)).toBe(34);
    expect(enhanceBonusPct(20)).toBe(69);
    expect(ENHANCE_LEVEL_BONUS_CUM).toHaveLength(21);
  });

  it("+20 이후는 무한 확장하되 증가폭을 낮춘다", () => {
    expect(enhanceBonusPct(30)).toBe(89);
    expect(enhanceBonusPct(40)).toBe(99);
  });
});

describe("parseEnhance (방어 파스 + 레벨 정규화)", () => {
  it("보너스는 저장값 무시·레벨 표로 정규화", () => {
    expect(parseEnhance({ level: 7, bonusPct: 99 })).toEqual({
      level: 7,
      bonusPct: 12,
    });
    expect(parseEnhance({ level: 99 })).toEqual({ level: 99, bonusPct: 158 });
    expect(parseEnhance({ level: 0 })).toBeUndefined();
    expect(parseEnhance("x")).toBeUndefined();
  });
});

describe("enhancedPower", () => {
  it("미강화는 그대로 두고 강화 위력은 0.01 단위까지 보존한다", () => {
    expect(enhancedPower(322, undefined)).toBe(322);
    expect(enhancedPower(322, { level: 12, bonusPct: 34 })).toBe(431.48);
    expect(enhancedPower(100, { level: 1, bonusPct: 1 })).toBe(101);
    expect(enhancedPower(1, { level: 20, bonusPct: 69 })).toBe(1.69);
    expect(
      powerWithBonuses(
        5,
        { level: 1, bonusPct: 1 },
        { level: 1, bonusPct: 5 },
      ),
    ).toBe(5.3);
  });
});

describe("4결과 표 + 돌 변환", () => {
  it("각 행 합 = 100 (기본·붉은·푸른)", () => {
    for (let lv = 0; lv < ENHANCE_OUTCOME_TABLE.length; lv++) {
      for (const c of ["none", "red", "blue"] as const) {
        const [s, k, d, x] = enhanceOutcomeRow(lv, c);
        expect(s + k + d + x).toBe(100);
        expect(Math.min(s, k, d, x)).toBeGreaterThanOrEqual(0);
      }
    }
  });
  it("붉은/푸른 변환 — +10 체크포인트, 푸른은 +12 도전까지 완전 방어", () => {
    expect(enhanceOutcomeRow(9, "none")).toEqual([18, 42, 27, 13]);
    expect(enhanceOutcomeRow(9, "red")).toEqual([33, 27, 27, 13]);
    expect(enhanceOutcomeRow(9, "blue")).toEqual([18, 52, 30, 0]);
    expect(enhanceOutcomeRow(10, "none")).toEqual([14, 68, 0, 18]);
    expect(enhanceOutcomeRow(10, "red")).toEqual([24, 53, 0, 23]);
    expect(enhanceOutcomeRow(10, "blue")).toEqual([14, 86, 0, 0]);
    expect(enhanceOutcomeRow(11, "blue")).toEqual([12, 44, 44, 0]);
    expect(enhanceOutcomeRow(12, "blue")).toEqual([10, 37, 41, 12]);
    expect(enhanceOutcomeRow(19, "red")).toEqual([13, 5, 50, 32]);
    expect(enhanceOutcomeRow(19, "blue")).toEqual([3, 25, 55, 17]);
    // 저강(+0) — 파괴·하락 0이라 푸른 무의미, 붉은은 성공 100 캡 합 보존
    expect(enhanceOutcomeRow(0, "red")).toEqual([100, 0, 0, 0]);
  });
  it("rollEnhanceOutcome — 경계 결정성", () => {
    // +9 기본: [15,42,28,15] → r=0.10→success, 0.50→keep, 0.80→demote, 0.99→destroy
    expect(rollEnhanceOutcome(9, "none", () => 0.1)).toBe("success");
    expect(rollEnhanceOutcome(9, "none", () => 0.5)).toBe("keep");
    expect(rollEnhanceOutcome(9, "none", () => 0.8)).toBe("demote");
    expect(rollEnhanceOutcome(9, "none", () => 0.99)).toBe("destroy");
    expect(rollEnhanceOutcome(9, "blue", () => 0.999)).not.toBe("destroy");
  });
});

describe("비용 다이얼 (제곱 램프)", () => {
  it("골드 = +9까지 제곱, +10부터 지수 램프 · 돌은 +12까지 완화", () => {
    expect(enhanceGoldCost(322, 0)).toBe(4830);
    expect(enhanceGoldCost(322, 9)).toBe(483000);
    expect(enhanceGoldCost(322, 10)).toBe(847423);
    expect(enhanceGoldCost(322, 19)).toBe(79375622);
    expect(enhanceStoneCost(0)).toBe(1);
    expect(enhanceStoneCost(6)).toBe(3); // +7 전 선택 구간은 기존 비용 유지
    expect(enhanceStoneCost(7)).toBe(1);
    expect(enhanceStoneCost(8)).toBe(1);
    expect(enhanceStoneCost(9)).toBe(2);
    expect(enhanceStoneCost(10)).toBe(2);
    expect(enhanceStoneCost(11)).toBe(3);
    expect(enhanceStoneCost(12)).toBe(7);
    expect(enhanceStoneCost(20)).toBe(23);
    expect(enhanceStoneCost(21)).toBe(26);
  });
});

describe("demoteEnhance — 레벨 −1·표 재파생", () => {
  it("+7 → +6 (12% → 10%)", () => {
    expect(demoteEnhance({ level: 7, bonusPct: 12 })).toEqual({
      level: 6,
      bonusPct: 10,
    });
    expect(demoteEnhance({ level: 1, bonusPct: 2 })).toBeUndefined();
  });
});

describe("세이브 왕복 + resolve 반영", () => {
  const WEAPON = "v2_den_greatsword" as V2EquipmentId;
  it("resolve — 강화 개체 위력 배율(레벨 표 기준)", () => {
    const { owned, equipped } = parseEquipmentSave({
      owned: [
        {
          iid: "a",
          id: WEAPON,
          roll: { power: 300, weight: 5 },
          enhance: { level: 12, bonusPct: 34 },
        },
      ],
      equipped: { weapon: "a" },
    });
    const { statRolls } = resolveEquippedForAggregate(owned, equipped);
    expect(statRolls[WEAPON]!.power).toBe(402); // 300×1.34
  });
  it("resolve — 낮은 위력의 1% 강화도 전투 합산값에 보존", () => {
    const { owned, equipped } = parseEquipmentSave({
      owned: [
        {
          iid: "a",
          id: WEAPON,
          roll: { power: 5, weight: 5 },
          enhance: { level: 1, bonusPct: 1 },
        },
      ],
      equipped: { weapon: "a" },
    });
    const { statRolls } = resolveEquippedForAggregate(owned, equipped);
    expect(statRolls[WEAPON]!.power).toBe(5.05);
  });
  it("미강화는 기존과 byte-동일", () => {
    const { owned, equipped } = parseEquipmentSave({
      owned: [{ iid: "a", id: WEAPON, roll: { power: 300, weight: 5 } }],
      equipped: { weapon: "a" },
    });
    const { statRolls } = resolveEquippedForAggregate(owned, equipped);
    expect(statRolls[WEAPON]).toEqual({ power: 300, weight: 5 });
  });
  it("쓰레기 enhance 무시", () => {
    const { owned } = parseEquipmentSave({
      owned: [{ iid: "a", id: WEAPON, enhance: "garbage" }],
      equipped: {},
    });
    expect(owned[0].enhance).toBeUndefined();
  });
});
