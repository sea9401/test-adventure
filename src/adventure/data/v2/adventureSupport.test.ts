import { describe, expect, it } from "vitest";
import {
  ADVENTURE_SUPPORT_PASS,
  MUSEUN_COIN_PACKAGES,
  PREMIUM_ADVENTURE_SUPPORT_PASS,
  adventureSupportActive,
  adventureSupportBenefits,
  adventureSupportTier,
  grantAdventureSupport,
  grantPremiumAdventureSupport,
  huntCountsForAdventureSupport,
  maxHuntBatchForAdventureSupport,
  normalizeHuntCount,
  parseAdventureSupportState,
} from "./adventureSupport";

const DAY_MS = 86_400_000;

describe("월간 모험 지원권", () => {
  it("무슨 코인 충전권의 코인과 원화 금액을 고정한다", () => {
    expect(MUSEUN_COIN_PACKAGES).toEqual([
      { id: "coin_1000", coins: 1_000, priceKrw: 10_000 },
      { id: "coin_2000", coins: 2_000, priceKrw: 20_000 },
      { id: "coin_3000", coins: 3_000, priceKrw: 30_000 },
      { id: "coin_5000", coins: 5_000, priceKrw: 50_000 },
    ]);
  });

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

  it("프리미엄 이용자는 100회 전투를 선택할 수 있다", () => {
    expect(huntCountsForAdventureSupport("premium")).toEqual([
      1, 5, 10, 50, 100,
    ]);
    expect(maxHuntBatchForAdventureSupport("premium")).toBe(100);
    expect(normalizeHuntCount(100, "premium")).toBe(100);
    expect(normalizeHuntCount(100, "standard")).toBe(1);
  });

  it("지원권 가격과 기간을 고정한다", () => {
    expect(ADVENTURE_SUPPORT_PASS.coinPrice).toBe(1_000);
    expect(ADVENTURE_SUPPORT_PASS.durationDays).toBe(30);
  });

  it("에너지와 거래소 혜택을 고정한다", () => {
    expect(ADVENTURE_SUPPORT_PASS.staminaMaxBonus).toBe(1_000);
    expect(ADVENTURE_SUPPORT_PASS.staminaActivationGrant).toBe(1_000);
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

  it("기존 저장 상태를 일반 지원권으로 판정한다", () => {
    const now = Date.UTC(2026, 7, 30);
    const legacy = { activatedAt: now, activeUntil: now + 10 * DAY_MS };

    expect(parseAdventureSupportState(legacy)).toEqual(legacy);
    expect(adventureSupportTier(legacy, now)).toBe("standard");
    expect(adventureSupportTier(legacy, now + 10 * DAY_MS)).toBe("none");
  });

  it("일반 지원권 잔여 10일 앞에 프리미엄 30일을 삽입한다", () => {
    const now = Date.UTC(2026, 7, 30);
    const standard = grantAdventureSupport(null, 10, now)?.state;
    const premium = grantPremiumAdventureSupport(standard, 30, now);

    expect(premium?.state).toEqual({
      activatedAt: now,
      premiumUntil: now + 30 * DAY_MS,
      activeUntil: now + 40 * DAY_MS,
    });
    expect(adventureSupportTier(premium?.state, now + 29 * DAY_MS)).toBe(
      "premium",
    );
    expect(adventureSupportTier(premium?.state, now + 30 * DAY_MS)).toBe(
      "standard",
    );
    expect(adventureSupportTier(premium?.state, now + 40 * DAY_MS)).toBe(
      "none",
    );
  });

  it("프리미엄 재사용은 두 만료를 함께 연장하고 대기 일반 기간을 보존한다", () => {
    const now = Date.UTC(2026, 7, 30);
    const standard = grantAdventureSupport(null, 7, now)?.state;
    const first = grantPremiumAdventureSupport(standard, 30, now)!.state;
    const second = grantPremiumAdventureSupport(first, 30, now + DAY_MS)!.state;

    expect(second.premiumUntil).toBe(now + 60 * DAY_MS);
    expect(second.activeUntil).toBe(now + 67 * DAY_MS);
  });

  it("프리미엄 중 일반 지원권 지급은 최종 만료만 연장한다", () => {
    const now = Date.UTC(2026, 7, 30);
    const premium = grantPremiumAdventureSupport(null, 30, now)!.state;
    const queued = grantAdventureSupport(premium, 7, now + DAY_MS)!.state;

    expect(queued.premiumUntil).toBe(now + 30 * DAY_MS);
    expect(queued.activeUntil).toBe(now + 37 * DAY_MS);
  });

  it("프리미엄 혜택은 일반 혜택과 합산하지 않는다", () => {
    expect(PREMIUM_ADVENTURE_SUPPORT_PASS).toMatchObject({
      coinPrice: 2_500,
      durationDays: 30,
      staminaMaxBonus: 3_000,
      staminaActivationGrant: 3_000,
      staminaRegenBonusPct: 20,
      marketplaceSlotBonus: 20,
      marketplaceTaxRate: 0.05,
      activeMaxHuntBatch: 100,
      cosmeticExtensionGrant: 2,
    });
    expect(adventureSupportBenefits("premium").staminaMaxBonus).toBe(3_000);
    expect(adventureSupportBenefits("standard").staminaMaxBonus).toBe(1_000);
    expect(adventureSupportBenefits("none").staminaMaxBonus).toBe(0);
  });
});
