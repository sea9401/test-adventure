import { describe, expect, it } from "vitest";
import {
  ENHANCE_MAX_LEVEL,
  ENHANCE_STONES,
  ENHANCE_SUCCESS_MIN_PCT,
  enhancedPower,
  enhanceGoldCost,
  enhanceStoneCost,
  enhanceSuccessPct,
  parseEnhance,
} from "./v2Enhance";
import {
  parseEquipmentSave,
  resolveEquippedForAggregate,
  V2_EQUIPMENT,
  type V2EquipmentId,
} from "./v2Equipment";

describe("parseEnhance (방어 파스)", () => {
  it("정상값 통과 + 미강화/쓰레기 = undefined", () => {
    expect(parseEnhance({ level: 7, bonusPct: 19 })).toEqual({
      level: 7,
      bonusPct: 19,
    });
    expect(parseEnhance(undefined)).toBeUndefined();
    expect(parseEnhance(null)).toBeUndefined();
    expect(parseEnhance("x")).toBeUndefined();
    expect(parseEnhance({ level: 0, bonusPct: 5 })).toBeUndefined();
    expect(parseEnhance({ level: -3 })).toBeUndefined();
  });

  it("클램프 — 레벨 ≤ MAX, 보너스 ≤ MAX×붉은(3%p), 음수 보너스 0", () => {
    expect(parseEnhance({ level: 99, bonusPct: 999 })).toEqual({
      level: ENHANCE_MAX_LEVEL,
      bonusPct: ENHANCE_MAX_LEVEL * ENHANCE_STONES.red.bonusPct,
    });
    expect(parseEnhance({ level: 3, bonusPct: -5 })).toEqual({
      level: 3,
      bonusPct: 0,
    });
    // 문자열 숫자(손상 세이브) 수용 + 내림.
    expect(parseEnhance({ level: "4.9", bonusPct: "10.7" })).toEqual({
      level: 4,
      bonusPct: 10,
    });
  });
});

describe("enhancedPower (위력 배율 — 단일 출처)", () => {
  it("미강화 passthrough + 곱연산 내림", () => {
    expect(enhancedPower(322, undefined)).toBe(322);
    expect(enhancedPower(322, { level: 10, bonusPct: 30 })).toBe(418); // 322×1.3=418.6
    expect(enhancedPower(100, { level: 1, bonusPct: 2 })).toBe(102);
    expect(enhancedPower(100, { level: 1, bonusPct: 0 })).toBe(100);
  });
});

describe("성공률·비용 다이얼", () => {
  it("푸른 = 기본표(후반 60%), 붉은 = −10%p (MIN 25 는 가드로만)", () => {
    expect(enhanceSuccessPct(0, "blue")).toBe(100);
    expect(enhanceSuccessPct(0, "red")).toBe(90);
    expect(enhanceSuccessPct(9, "blue")).toBe(60);
    expect(enhanceSuccessPct(9, "red")).toBe(50);
    expect(ENHANCE_SUCCESS_MIN_PCT).toBe(25); // 표가 더 낮아질 때의 바닥 가드
  });
  it("강화석 비용 램프 1/2/3/4", () => {
    expect(enhanceStoneCost(0)).toBe(1);
    expect(enhanceStoneCost(3)).toBe(2);
    expect(enhanceStoneCost(6)).toBe(3);
    expect(enhanceStoneCost(9)).toBe(4);
  });
  it("골드 수수료 — 위력·강 비례", () => {
    expect(enhanceGoldCost(300, 0)).toBe(600);
    expect(enhanceGoldCost(300, 9)).toBe(6000);
  });
});

describe("세이브 왕복 + resolve 반영", () => {
  const WEAPON = "v2_den_greatsword" as V2EquipmentId;

  it("parseEquipmentSave — enhance 보존(왕복) + 쓰레기 무시", () => {
    const { owned } = parseEquipmentSave({
      owned: [
        { iid: "a", id: WEAPON, enhance: { level: 7, bonusPct: 19 } },
        { iid: "b", id: WEAPON, enhance: "garbage" },
      ],
      equipped: {},
    });
    expect(owned[0].enhance).toEqual({ level: 7, bonusPct: 19 });
    expect(owned[1].enhance).toBeUndefined();
  });

  it("resolve — 강화 개체는 위력만 배율, 옵션·무게 불변", () => {
    const item = V2_EQUIPMENT[WEAPON];
    const { owned, equipped } = parseEquipmentSave({
      owned: [
        {
          iid: "a",
          id: WEAPON,
          roll: { power: 300, weight: item.weight, options: item.options },
          enhance: { level: 10, bonusPct: 30 },
        },
      ],
      equipped: { weapon: "a" },
    });
    const { statRolls } = resolveEquippedForAggregate(owned, equipped);
    expect(statRolls[WEAPON]!.power).toBe(390); // 300×1.3
    expect(statRolls[WEAPON]!.weight).toBe(item.weight);
    expect(statRolls[WEAPON]!.options).toEqual(item.options);
  });

  it("resolve — 굴림 없는 개체(상점)도 카탈로그 위력 기준 강화", () => {
    const item = V2_EQUIPMENT[WEAPON];
    const { owned, equipped } = parseEquipmentSave({
      owned: [{ iid: "a", id: WEAPON, enhance: { level: 5, bonusPct: 10 } }],
      equipped: { weapon: "a" },
    });
    const { statRolls } = resolveEquippedForAggregate(owned, equipped);
    expect(statRolls[WEAPON]!.power).toBe(Math.floor(item.power * 1.1));
    expect(statRolls[WEAPON]!.weight).toBe(item.weight);
    // options 미지정 — effectiveStats 가 카탈로그 옵션을 쓰므로 의미 동일.
    expect(statRolls[WEAPON]!.options).toBeUndefined();
  });

  it("resolve — 미강화는 기존과 byte-동일(굴림 그대로/굴림 없음 미생성)", () => {
    const { owned, equipped } = parseEquipmentSave({
      owned: [
        { iid: "a", id: WEAPON, roll: { power: 300, weight: 5 } },
        { iid: "b", id: "v2_den_set_armor" },
      ],
      equipped: { weapon: "a", armor: "b" },
    });
    const { statRolls } = resolveEquippedForAggregate(owned, equipped);
    expect(statRolls[WEAPON]).toEqual({ power: 300, weight: 5 });
    expect(statRolls["v2_den_set_armor" as V2EquipmentId]).toBeUndefined();
  });
});
