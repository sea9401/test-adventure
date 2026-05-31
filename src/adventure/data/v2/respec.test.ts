import { describe, it, expect } from "vitest";
import {
  ADVANCE_GOLD_PER_LEVEL,
  CLASS_CHANGE_GOLD_PER_LEVEL,
  ELEMENT_CHANGE_GOLD_PER_LEVEL,
  advanceGoldCost,
  isClassChange,
  isElementChange,
  isPaidRespec,
  respecGoldCost,
} from "./respec";

describe("v2 비용 전직 (PR-6)", () => {
  it("isClassChange — 직업군 기준 (none 첫선택 무료, 다른 군 변경, 같은 군 무변경)", () => {
    expect(isClassChange("none", "swordsman")).toBe(false); // 첫 선택
    expect(isClassChange("swordsman", "mage")).toBe(true); // 다른 직업군
    expect(isClassChange("swordsman", "swordsman")).toBe(false); // 동일
    // PR-7 — 같은 직업군 차수 이동은 변경 아님(검사→견습 검사 = 검술 유지).
    expect(isClassChange("swordmaster", "swordsman")).toBe(false);
    expect(isClassChange("swordmaster", "mage")).toBe(true); // 2차에서 타 군은 변경
  });

  it("isElementChange — neutral(첫 선택)→X 무료, X→Y 변경", () => {
    expect(isElementChange("neutral", "fire")).toBe(false); // 첫 선택
    expect(isElementChange("fire", "water")).toBe(true); // 변경
    expect(isElementChange("fire", "fire")).toBe(false);
  });

  it("respecGoldCost — 첫 선택 0, 변경된 축만 레벨비례 합산", () => {
    // 첫 선택(none/neutral) = 무료.
    expect(respecGoldCost("none", "swordsman", "neutral", "fire", 50)).toBe(0);
    // 직업만 변경 = level × CLASS.
    expect(respecGoldCost("swordsman", "mage", "fire", "fire", 50)).toBe(
      50 * CLASS_CHANGE_GOLD_PER_LEVEL,
    );
    // 속성만 변경 = level × ELEMENT.
    expect(respecGoldCost("mage", "mage", "fire", "water", 50)).toBe(
      50 * ELEMENT_CHANGE_GOLD_PER_LEVEL,
    );
    // 둘 다 변경 = 합산.
    expect(respecGoldCost("swordsman", "mage", "fire", "water", 10)).toBe(
      10 * CLASS_CHANGE_GOLD_PER_LEVEL + 10 * ELEMENT_CHANGE_GOLD_PER_LEVEL,
    );
  });

  it("respecGoldCost — level 최소 1 클램프", () => {
    expect(respecGoldCost("swordsman", "mage", "fire", "fire", 0)).toBe(
      CLASS_CHANGE_GOLD_PER_LEVEL,
    );
    expect(respecGoldCost("swordsman", "mage", "fire", "fire", -5)).toBe(
      CLASS_CHANGE_GOLD_PER_LEVEL,
    );
  });

  it("isPaidRespec — 변경된 축이 하나라도 있으면 유료", () => {
    expect(isPaidRespec("none", "swordsman", "neutral", "neutral")).toBe(false);
    expect(isPaidRespec("swordsman", "swordsman", "fire", "fire")).toBe(false);
    expect(isPaidRespec("swordsman", "mage", "fire", "fire")).toBe(true);
    expect(isPaidRespec("swordsman", "swordsman", "fire", "water")).toBe(true);
  });

  it("advanceGoldCost (PR-7 2차 전직) — 레벨 비례, level 최소 1", () => {
    expect(advanceGoldCost(30)).toBe(30 * ADVANCE_GOLD_PER_LEVEL);
    expect(advanceGoldCost(1)).toBe(ADVANCE_GOLD_PER_LEVEL);
    expect(advanceGoldCost(0)).toBe(ADVANCE_GOLD_PER_LEVEL); // 클램프
  });
});
