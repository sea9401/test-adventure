import { describe, it, expect } from "vitest";
import {
  CLASS_CHANGE_GOLD_PER_LEVEL,
  isClassChange,
  isPaidRespec,
  respecGoldCost,
} from "./respec";

describe("v2 비용 전직 (PR-6)", () => {
  it("isClassChange — 직업군 기준 (none 첫선택 무료, 다른 군 변경, 같은 군 무변경)", () => {
    expect(isClassChange("none", "warrior")).toBe(false); // 첫 선택
    expect(isClassChange("warrior", "mage")).toBe(true); // 다른 직업군
    expect(isClassChange("warrior", "warrior")).toBe(false); // 동일
  });

  it("respecGoldCost — 첫 선택 0, 직업 변경만 계산", () => {
    expect(respecGoldCost("none", "warrior", 50)).toBe(0);
    expect(respecGoldCost("warrior", "mage", 50)).toBe(
      50 * CLASS_CHANGE_GOLD_PER_LEVEL,
    );
    expect(respecGoldCost("mage", "mage", 50)).toBe(0);
  });

  it("respecGoldCost — level 최소 1 클램프", () => {
    expect(respecGoldCost("warrior", "mage", 0)).toBe(
      CLASS_CHANGE_GOLD_PER_LEVEL,
    );
    expect(respecGoldCost("warrior", "mage", -5)).toBe(
      CLASS_CHANGE_GOLD_PER_LEVEL,
    );
  });

  it("isPaidRespec — 직업군 변경만 대상으로 삼는다", () => {
    expect(isPaidRespec("none", "warrior")).toBe(false);
    expect(isPaidRespec("warrior", "warrior")).toBe(false);
    expect(isPaidRespec("warrior", "mage")).toBe(true);
  });
});
