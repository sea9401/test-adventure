import { describe, it, expect } from "vitest";
import {
  isHarvestReady,
  harvestRemainingMs,
  harvestYield,
  nextTier,
  tierMeetsNation,
  NATION_REQUIRED_TIER,
  canUpgrade,
  applyUpgradeCost,
  tryStartProduction,
  isValidVillageName,
  PRODUCTION_DURATION_MS,
  PRODUCTION_BASE_YIELD,
  TRAIT_BONUS_PCT,
  MAX_SLOTS_BY_TIER,
  GRID_COLS_BY_TIER,
  clampUnlockedSlots,
  canUnlockSlot,
  applySlotUnlockCost,
  slotUnlockCost,
  SLOT_UNLOCK_BASE,
  UPGRADE_COST,
  type ProductionJob,
} from "./settlement";
import { terrainTraitOf } from "./outposts";

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

  it("MAX_SLOTS_BY_TIER — 마을 2×2(4), 도시·대도시 3×3(9)", () => {
    expect(MAX_SLOTS_BY_TIER.village).toBe(4);
    expect(MAX_SLOTS_BY_TIER.city).toBe(9);
    expect(MAX_SLOTS_BY_TIER.metropolis).toBe(9);
    expect(GRID_COLS_BY_TIER.village).toBe(2);
    expect(GRID_COLS_BY_TIER.city).toBe(3);
  });

  it("clampUnlockedSlots — [1, 최대]로 보정, 손상값 방어", () => {
    expect(clampUnlockedSlots("village", 0)).toBe(1);
    expect(clampUnlockedSlots("village", 9)).toBe(4); // 마을 판 최대 4
    expect(clampUnlockedSlots("village", 3)).toBe(3);
    expect(clampUnlockedSlots("city", 9)).toBe(9);
    expect(clampUnlockedSlots("city", 99)).toBe(9);
    expect(clampUnlockedSlots("village", NaN)).toBe(1);
    expect(clampUnlockedSlots("village", 2.5)).toBe(1);
  });

  it("canUpgrade — 판 다 채우고 재화 충분해야 ok(needSlots/insufficient 구분)", () => {
    // 마을→도시 비용 = crop 100 / ore 60. 마을 판(4칸)을 다 열어야 업그레이드 가능.
    expect(canUpgrade("village", 4, { crop: 100, ore: 60 })).toEqual({
      ok: true,
      next: "city",
      missing: [],
      needSlots: false,
    });
    // 재화 부족 → ok false, missing.
    const r = canUpgrade("village", 4, { crop: 100, ore: 10 });
    expect(r.ok).toBe(false);
    expect(r.next).toBe("city");
    expect(r.missing).toContain("ore");
    expect(r.needSlots).toBe(false);
    // 칸 미해금(판 안 참) → 재화 충분해도 needSlots 로 막힘.
    const s = canUpgrade("village", 1, { crop: 999, ore: 999 });
    expect(s.ok).toBe(false);
    expect(s.needSlots).toBe(true);
    // 최종 단계는 업그레이드 없음.
    expect(canUpgrade("metropolis", 9, { crop: 9999 })).toMatchObject({
      ok: false,
      next: null,
    });
  });

  it("칸 해금 — 비용(특화 종류·누진)·차감·판 가득(atMax)", () => {
    // 다음 칸 비용 = base × 현재 해금 수.
    expect(slotUnlockCost("crop", 1)).toEqual({ crop: SLOT_UNLOCK_BASE.crop });
    expect(slotUnlockCost("ore", 3)).toEqual({ ore: SLOT_UNLOCK_BASE.ore * 3 });
    // 재화 충분 → ok.
    expect(
      canUnlockSlot("village", 1, "crop", { crop: SLOT_UNLOCK_BASE.crop }),
    ).toMatchObject({ ok: true, atMax: false });
    // 재화 부족 → ok false.
    expect(canUnlockSlot("village", 1, "crop", { crop: 0 }).ok).toBe(false);
    // 마을 판 다 참(4칸) → atMax(다음은 단계 업그레이드).
    expect(
      canUnlockSlot("village", 4, "crop", { crop: 9999 }),
    ).toMatchObject({ ok: false, atMax: true });
    // 차감 — 음수로 안 감.
    const after = applySlotUnlockCost("crop", 1, {
      crop: SLOT_UNLOCK_BASE.crop + 5,
      ore: 3,
    });
    expect(after.crop).toBe(5);
    expect(after.ore).toBe(3); // 다른 종류 불변
    expect(applySlotUnlockCost("crop", 1, { crop: 0 }).crop).toBe(0);
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

  it("tryStartProduction — 해금된 칸만 성공, 범위 밖/사용중 거부", () => {
    const empty: Record<string, ProductionJob> = {};
    // 해금 1칸 → slot 0 만 유효.
    const r = tryStartProduction(empty, 1, 0, "crop", 1000);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.jobs["0"]).toEqual({ kind: "crop", startedAt: 1000 });

    // 해금 범위 밖(1칸이라 slot 1 없음).
    expect(tryStartProduction(empty, 1, 1, "crop", 1000)).toEqual({
      ok: false,
      error: "slot_out_of_range",
    });
    // 해금 2칸이면 slot 1 유효.
    expect(tryStartProduction(empty, 2, 1, "crop", 1000).ok).toBe(true);
    // 음수/비정수.
    expect(tryStartProduction(empty, 3, -1, "crop", 1000).ok).toBe(false);

    // 이미 사용 중.
    const busy = { "0": { kind: "ore" as const, startedAt: 5 } };
    expect(tryStartProduction(busy, 1, 0, "crop", 1000)).toEqual({
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

  it("terrainTraitOf — 타입 파생 + 오버라이드(거점 id 큐레이션 잠금)", () => {
    // 광산 type → 광맥
    expect(terrainTraitOf("city_iron_pit")).toBe("mine");
    expect(terrainTraitOf("war_central_mine")).toBe("mine");
    // 마을 type → 농지
    expect(terrainTraitOf("city_oakheart")).toBe("farmland");
    expect(terrainTraitOf("village_wheatfield")).toBe("farmland");
    // 요새/탑 → 평지
    expect(terrainTraitOf("war_central_fort")).toBe("plain");
    expect(terrainTraitOf("war_central_tower")).toBe("plain");
    // 물 테마 오버라이드 → 호수(마을 type 이지만)
    expect(terrainTraitOf("city_river_haven")).toBe("lake");
    expect(terrainTraitOf("village_dewfall")).toBe("lake");
    // 광맥 이름 마을 오버라이드 → 광맥
    expect(terrainTraitOf("village_oremouth")).toBe("mine");
    // 미지 거점 → 평지
    expect(terrainTraitOf("no_such_outpost")).toBe("plain");
  });

  it("tierMeetsNation — 대도시만 국가 선포 게이트 충족", () => {
    expect(NATION_REQUIRED_TIER).toBe("metropolis");
    expect(tierMeetsNation("metropolis")).toBe(true);
    expect(tierMeetsNation("city")).toBe(false);
    expect(tierMeetsNation("village")).toBe(false);
    // 손상/미지 tier 문자열은 충족 안 함(라우트 게이트가 막힘쪽으로 안전 fallback).
    expect(tierMeetsNation("garbage" as never)).toBe(false);
  });
});
