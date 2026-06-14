import { describe, it, expect } from "vitest";
import {
  ejectBountyGold,
  EJECT_BOUNTY_BASE_GOLD,
  EJECT_BOUNTY_MAX_GOLD,
} from "./ejectBounty";

describe("ejectBountyGold", () => {
  it("침입자 무일푼이면 0", () => {
    expect(ejectBountyGold(0, 2)).toBe(0);
    expect(ejectBountyGold(-5, 2)).toBe(0);
  });

  it("tier 비례 정액 + 보유 골드 5% (보유 충분·상한 미만 구간)", () => {
    // 보유 1000(raw < 보유 & < MAX 500): tier 스케일링이 그대로 드러남.
    // tier1(=1.0): round(50*1 + 1000*0.05) = round(100) = 100
    expect(ejectBountyGold(1000, 1)).toBe(100);
    // tier2(=1.4): round(50*1.4 + 50) = round(120) = 120
    expect(ejectBountyGold(1000, 2)).toBe(120);
    // tier4(=2.5): round(50*2.5 + 50) = round(175) = 175
    expect(ejectBountyGold(1000, 4)).toBe(175);
  });

  it("raw 가 보유 골드를 넘으면 보유분까지만 (예: 100 보유에 tier4)", () => {
    // raw = round(125 + 5) = 130 > 보유 100 → 100 으로 캡.
    expect(ejectBountyGold(100, 4)).toBe(100);
  });

  it("침입자 보유 골드보다 더 떼지 않는다(음수 잔액 불가)", () => {
    // targetGold 30 < raw(52) → 30 만 뗌.
    expect(ejectBountyGold(30, 1)).toBe(30);
    // 차감 후 잔액 0 이상.
    expect(30 - ejectBountyGold(30, 1)).toBeGreaterThanOrEqual(0);
  });

  it("1회 상한(MAX) 적용", () => {
    expect(ejectBountyGold(1_000_000, 4)).toBe(EJECT_BOUNTY_MAX_GOLD);
  });

  it("미정의 tier 는 mult 1 폴백", () => {
    expect(ejectBountyGold(100, 99)).toBe(
      Math.round(EJECT_BOUNTY_BASE_GOLD * 1 + 100 * 0.05),
    );
  });
});
