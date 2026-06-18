import { describe, it, expect } from "vitest";
import {
  isHarvestReady,
  harvestRemainingMs,
  harvestYield,
  nextTier,
  canUpgrade,
  PRODUCTION_DURATION_MS,
  PRODUCTION_BASE_YIELD,
  TRAIT_BONUS_PCT,
  SLOTS_BY_TIER,
  type ProductionJob,
} from "./settlement";

const T0 = 1_750_000_000_000;

describe("settlement — 생산 엔진", () => {
  it("isHarvestReady — duration 경과 전 false, 후 true", () => {
    const job: ProductionJob = { kind: "crop", startedAt: T0 };
    const dur = PRODUCTION_DURATION_MS.crop;
    expect(isHarvestReady(job, T0)).toBe(false);
    expect(isHarvestReady(job, T0 + dur - 1)).toBe(false);
    expect(isHarvestReady(job, T0 + dur)).toBe(true);
    expect(isHarvestReady(job, T0 + dur + 999999)).toBe(true); // 늦어도 준비됨
  });

  it("harvestRemainingMs — 0 으로 수렴, 미래 startedAt 은 duration 클램프", () => {
    const job: ProductionJob = { kind: "ore", startedAt: T0 };
    const dur = PRODUCTION_DURATION_MS.ore;
    expect(harvestRemainingMs(job, T0)).toBe(dur);
    expect(harvestRemainingMs(job, T0 + dur)).toBe(0);
    expect(harvestRemainingMs(job, T0 + dur + 5000)).toBe(0);
    // 미래 startedAt(클락스큐) → duration 초과 안 함.
    expect(harvestRemainingMs({ kind: "ore", startedAt: T0 + 10 * dur }, T0)).toBe(
      dur,
    );
  });

  it("harvestYield — 완료 전 0, 완료 후 기본 수확량", () => {
    const job: ProductionJob = { kind: "crop", startedAt: T0 };
    const dur = PRODUCTION_DURATION_MS.crop;
    expect(harvestYield(job, "plain", T0)).toBe(0);
    expect(harvestYield(job, "plain", T0 + dur)).toBe(PRODUCTION_BASE_YIELD.crop);
  });

  it("harvestYield — 일치 특성이면 +보너스, 불일치면 기본", () => {
    const dur = PRODUCTION_DURATION_MS.crop;
    const done = T0 + dur;
    const job: ProductionJob = { kind: "crop", startedAt: T0 };
    // farmland=작물 보너스.
    expect(harvestYield(job, "farmland", done)).toBe(
      Math.round(PRODUCTION_BASE_YIELD.crop * (1 + TRAIT_BONUS_PCT / 100)),
    );
    // mine=광물 보너스라 작물엔 무효.
    expect(harvestYield(job, "mine", done)).toBe(PRODUCTION_BASE_YIELD.crop);
  });

  it("nextTier — 마을→도시→대도시→null", () => {
    expect(nextTier("village")).toBe("city");
    expect(nextTier("city")).toBe("metropolis");
    expect(nextTier("metropolis")).toBe(null);
  });

  it("SLOTS_BY_TIER — 단계 오를수록 슬롯↑", () => {
    expect(SLOTS_BY_TIER.village).toBeLessThan(SLOTS_BY_TIER.city);
    expect(SLOTS_BY_TIER.city).toBeLessThan(SLOTS_BY_TIER.metropolis);
  });

  it("canUpgrade — 재화 충분하면 ok, 부족하면 missing", () => {
    // 마을→도시 비용 = crop 100 / ore 60.
    expect(canUpgrade("village", { crop: 100, ore: 60 })).toEqual({
      ok: true,
      next: "city",
      missing: [],
    });
    const r = canUpgrade("village", { crop: 100, ore: 10 });
    expect(r.ok).toBe(false);
    expect(r.next).toBe("city");
    expect(r.missing).toContain("ore");
    // 최종 단계는 업그레이드 없음.
    expect(canUpgrade("metropolis", { crop: 9999 })).toMatchObject({
      ok: false,
      next: null,
    });
  });
});
