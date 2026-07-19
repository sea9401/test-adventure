import { describe, expect, it } from "vitest";
import {
  ADVENTURE_SUPPORT_PASS,
  adventureSupportActive,
  grantAdventureSupport,
  huntCountsForAdventureSupport,
  maxHuntBatchForAdventureSupport,
  normalizeHuntCount,
  parseAdventureSupportState,
} from "./adventureSupport";

describe("월간 모험 지원권", () => {
  it("미가입자는 10회까지만 선택할 수 있다", () => {
    expect(huntCountsForAdventureSupport(false)).toEqual([1, 5, 10]);
    expect(maxHuntBatchForAdventureSupport(false)).toBe(10);
    expect(normalizeHuntCount(50, false)).toBe(1);
  });

  it("활성 이용자는 50회 전투를 선택할 수 있다", () => {
    expect(huntCountsForAdventureSupport(true)).toEqual([1, 5, 10, 50]);
    expect(maxHuntBatchForAdventureSupport(true)).toBe(50);
    expect(normalizeHuntCount(50, true)).toBe(50);
  });

  it("지원권 가격과 기간을 고정한다", () => {
    expect(ADVENTURE_SUPPORT_PASS.coinPrice).toBe(800);
    expect(ADVENTURE_SUPPORT_PASS.durationDays).toBe(30);
  });

  it("에너지와 거래소 혜택을 고정한다", () => {
    expect(ADVENTURE_SUPPORT_PASS.staminaMaxBonus).toBe(500);
    expect(ADVENTURE_SUPPORT_PASS.staminaActivationGrant).toBe(500);
    expect(ADVENTURE_SUPPORT_PASS.staminaRegenBonusPct).toBe(20);
    expect(ADVENTURE_SUPPORT_PASS.marketplaceSlotBonus).toBe(10);
    expect(ADVENTURE_SUPPORT_PASS.marketplaceTaxRate).toBe(0.05);
  });

  it("수령 시점부터 기간을 시작하고 활성 기간 재지급은 뒤에 이어 붙인다", () => {
    const now = Date.UTC(2026, 6, 20);
    const first = grantAdventureSupport(null, 30, now);
    expect(first?.firstActivation).toBe(true);
    expect(first?.state.activeUntil).toBe(now + 30 * 86_400_000);
    expect(adventureSupportActive(first?.state, now)).toBe(true);

    const extended = grantAdventureSupport(first?.state, 7, now + 1_000);
    expect(extended?.firstActivation).toBe(false);
    expect(extended?.state.activeUntil).toBe(now + 37 * 86_400_000);
    expect(extended?.state.activatedAt).toBe(now);
  });

  it("만료 후 재지급은 재지급 시점부터 시작하며 최초 활성화로 보지 않는다", () => {
    const old = { activatedAt: 100, activeUntil: 200 };
    const renewed = grantAdventureSupport(old, 3, 1_000);
    expect(renewed).toEqual({
      state: { activatedAt: 100, activeUntil: 1_000 + 3 * 86_400_000 },
      days: 3,
      firstActivation: false,
    });
  });

  it("손상 상태와 지급 기간을 안전하게 정규화한다", () => {
    expect(parseAdventureSupportState({ activeUntil: "tomorrow" })).toBeNull();
    expect(grantAdventureSupport(null, 0, 100)).toBeNull();
    expect(grantAdventureSupport(null, Number.POSITIVE_INFINITY, 100)).toBeNull();
  });
});
