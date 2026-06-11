import { describe, expect, it } from "vitest";
import {
  ENHANCE_LEVEL_BONUS_CUM,
  ENHANCE_MAX_LEVEL,
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
  resolveEquippedForAggregate,
  type V2EquipmentId,
} from "./v2Equipment";

describe("구간 보너스 (레벨 기반·확실한 리턴)", () => {
  it("누적표 — +5=10% +7=16% +9=24% +10=34%(점프)", () => {
    expect(enhanceBonusPct(5)).toBe(10);
    expect(enhanceBonusPct(7)).toBe(16);
    expect(enhanceBonusPct(9)).toBe(24);
    expect(enhanceBonusPct(10)).toBe(34);
    expect(ENHANCE_LEVEL_BONUS_CUM).toHaveLength(ENHANCE_MAX_LEVEL + 1);
  });
});

describe("parseEnhance (방어 파스 + 레벨 정규화)", () => {
  it("보너스는 저장값 무시·레벨 표로 정규화", () => {
    expect(parseEnhance({ level: 7, bonusPct: 99 })).toEqual({
      level: 7,
      bonusPct: 16,
    });
    expect(parseEnhance({ level: 99 })).toEqual({ level: 10, bonusPct: 34 });
    expect(parseEnhance({ level: 0 })).toBeUndefined();
    expect(parseEnhance("x")).toBeUndefined();
  });
});

describe("enhancedPower", () => {
  it("미강화 passthrough + 곱연산 내림", () => {
    expect(enhancedPower(322, undefined)).toBe(322);
    expect(enhancedPower(322, { level: 10, bonusPct: 34 })).toBe(431); // 322×1.34
    expect(enhancedPower(100, { level: 1, bonusPct: 2 })).toBe(102);
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
  it("붉은 = 성공 +15%p(파괴 불변), 푸른 = 파괴 0 + 하락 −10", () => {
    // +9 기본 15/42/28/15
    expect(enhanceOutcomeRow(9, "none")).toEqual([15, 42, 28, 15]);
    expect(enhanceOutcomeRow(9, "red")).toEqual([30, 27, 28, 15]);
    expect(enhanceOutcomeRow(9, "blue")).toEqual([15, 52, 33, 0]);
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
  it("골드 = power×15×(n+1)² · 돌 1~4", () => {
    expect(enhanceGoldCost(322, 0)).toBe(4830);
    expect(enhanceGoldCost(322, 9)).toBe(483000);
    expect(enhanceStoneCost(0)).toBe(1);
    expect(enhanceStoneCost(9)).toBe(4);
  });
});

describe("demoteEnhance — 레벨 −1·표 재파생", () => {
  it("+7 → +6 (16% → 13%)", () => {
    expect(demoteEnhance({ level: 7, bonusPct: 16 })).toEqual({
      level: 6,
      bonusPct: 13,
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
          enhance: { level: 10, bonusPct: 34 },
        },
      ],
      equipped: { weapon: "a" },
    });
    const { statRolls } = resolveEquippedForAggregate(owned, equipped);
    expect(statRolls[WEAPON]!.power).toBe(402); // 300×1.34
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
