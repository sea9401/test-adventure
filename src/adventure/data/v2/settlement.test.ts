import { describe, it, expect } from "vitest";
import {
  isHarvestReady,
  harvestRemainingMs,
  harvestYield,
  nextTier,
  canUpgrade,
  applyUpgradeCost,
  tryStartProduction,
  isValidVillageName,
  PRODUCTION_DURATION_MS,
  PRODUCTION_BASE_YIELD,
  TRAIT_BONUS_PCT,
  SLOTS_BY_TIER,
  UPGRADE_COST,
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

  it("applyUpgradeCost — 비용만큼 차감, 음수로 안 감", () => {
    const cost = UPGRADE_COST.village ?? {};
    const after = applyUpgradeCost("village", { crop: 100, ore: 60, fish: 5 });
    expect(after.crop).toBe(100 - (cost.crop ?? 0));
    expect(after.ore).toBe(60 - (cost.ore ?? 0));
    expect(after.fish).toBe(5); // village→city 는 fish 비용 0 → 불변
    // 부족해도 음수 안 됨(0 클램프).
    expect(applyUpgradeCost("village", { crop: 10 }).crop).toBe(0);
  });

  it("tryStartProduction — 빈 슬롯 성공, 범위 밖/사용중 거부", () => {
    const empty: Record<string, ProductionJob> = {};
    // 마을 슬롯 1개 → slot 0 만 유효.
    const r = tryStartProduction(empty, "village", 0, "crop", 1000);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.jobs["0"]).toEqual({ kind: "crop", startedAt: 1000 });

    // 슬롯 범위 밖(마을은 1슬롯이라 slot 1 없음).
    expect(tryStartProduction(empty, "village", 1, "crop", 1000)).toEqual({
      ok: false,
      error: "slot_out_of_range",
    });
    // 음수/비정수.
    expect(tryStartProduction(empty, "city", -1, "crop", 1000).ok).toBe(false);

    // 이미 사용 중.
    const busy = { "0": { kind: "ore" as const, startedAt: 5 } };
    expect(tryStartProduction(busy, "village", 0, "crop", 1000)).toEqual({
      ok: false,
      error: "slot_busy",
    });
    // 비파괴 — 원본 jobs 불변.
    expect(empty).toEqual({});
  });

  it("isValidVillageName — 1~16자(트림), 빈/공백/초과 거부", () => {
    expect(isValidVillageName("샘플마을")).toBe(true);
    expect(isValidVillageName("a")).toBe(true);
    expect(isValidVillageName("  여백있음  ")).toBe(true); // 트림 후 유효
    expect(isValidVillageName("")).toBe(false);
    expect(isValidVillageName("   ")).toBe(false); // 공백뿐
    expect(isValidVillageName("x".repeat(16))).toBe(true);
    expect(isValidVillageName("x".repeat(17))).toBe(false);
  });
});
