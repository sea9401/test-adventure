import { describe, it, expect } from "vitest";
import {
  nextTier,
  tierMeetsNation,
  NATION_REQUIRED_TIER,
  canUpgrade,
  applyUpgradeCost,
  isValidVillageName,
  MAX_SLOTS_BY_TIER,
  GRID_COLS_BY_TIER,
  GRID_DISPLAY_COLS,
  GRID_DISPLAY_SLOTS,
  INITIAL_UNLOCKED_SLOTS,
  clampUnlockedSlots,
  canUnlockSlot,
  slotUnlockGoldCost,
  SLOT_UNLOCK_GOLD_BASE,
  SLOT_UNLOCK_GOLD_STEP,
  UPGRADE_COST,
} from "./settlement";
import { terrainTraitOf } from "./outposts";

// [PR-3] 슬롯 생산(produce/harvest) 폐지 — isHarvestReady/harvestYield/tryStartProduction 등
//   생산 헬퍼 테스트는 함수와 함께 삭제. 정착지 업글·칸 해금·검증 테스트만 유지.

describe("settlement — 정착지(업그레이드·칸 해금)", () => {
  it("nextTier — 마을→도시→대도시→null", () => {
    expect(nextTier("village")).toBe("city");
    expect(nextTier("city")).toBe("metropolis");
    expect(nextTier("metropolis")).toBe(null);
  });

  it("MAX_SLOTS_BY_TIER — 마을별 1슬롯 고정", () => {
    expect(MAX_SLOTS_BY_TIER.village).toBe(1);
    expect(MAX_SLOTS_BY_TIER.city).toBe(1);
    expect(MAX_SLOTS_BY_TIER.metropolis).toBe(1);
    expect(GRID_COLS_BY_TIER.village).toBe(1);
    expect(GRID_COLS_BY_TIER.city).toBe(1);
    expect(GRID_COLS_BY_TIER.metropolis).toBe(1);
    // 최종 판 크기 = cols² 일관성(1×1 = 1칸).
    expect(MAX_SLOTS_BY_TIER.metropolis).toBe(GRID_COLS_BY_TIER.metropolis ** 2);
    expect(GRID_DISPLAY_COLS).toBe(GRID_COLS_BY_TIER.metropolis); // 1
    expect(GRID_DISPLAY_SLOTS).toBe(MAX_SLOTS_BY_TIER.metropolis); // 1
  });

  it("INITIAL_UNLOCKED_SLOTS=0 / clampUnlockedSlots — [0, 최대]로 보정", () => {
    expect(INITIAL_UNLOCKED_SLOTS).toBe(0);
    expect(clampUnlockedSlots("village", 0)).toBe(0); // 건설 직후 빈 판
    expect(clampUnlockedSlots("village", 9)).toBe(1); // 마을 판 최대 1
    expect(clampUnlockedSlots("village", 1)).toBe(1);
    expect(clampUnlockedSlots("city", 9)).toBe(1);
    expect(clampUnlockedSlots("city", 99)).toBe(1);
    expect(clampUnlockedSlots("metropolis", 99)).toBe(1);
    expect(clampUnlockedSlots("village", -2)).toBe(0);
    expect(clampUnlockedSlots("village", NaN)).toBe(0);
    expect(clampUnlockedSlots("village", 2.5)).toBe(0);
  });

  it("canUpgrade — 판 다 채우고 재화 충분해야 ok(needSlots/insufficient 구분)", () => {
    const cost = UPGRADE_COST.village!; // 마을→도시 비용
    // 마을 판(1칸)을 열고 비용 충족 → ok.
    expect(
      canUpgrade("village", 1, { crop: cost.crop!, ore: cost.ore! }),
    ).toEqual({ ok: true, next: "city", missing: [], needSlots: false });
    // 재화 부족 → ok false, missing.
    const r = canUpgrade("village", 1, { crop: cost.crop!, ore: 0 });
    expect(r.ok).toBe(false);
    expect(r.next).toBe("city");
    expect(r.missing).toContain("ore");
    expect(r.needSlots).toBe(false);
    // 칸 미해금(판 안 참) → 재화 충분해도 needSlots 로 막힘.
    const s = canUpgrade("village", 0, { crop: 99999, ore: 99999 });
    expect(s.ok).toBe(false);
    expect(s.needSlots).toBe(true);
    // 최종 단계는 업그레이드 없음.
    expect(canUpgrade("metropolis", 1, { crop: 99999 })).toMatchObject({
      ok: false,
      next: null,
    });
  });

  it("칸 해금 — 첫 칸 유료(5천만)·1칸 가득(atMax)", () => {
    // 첫 칸(해금 0개)=base. step 은 후속 슬롯 확장용 다이얼로 유지.
    expect(slotUnlockGoldCost(0)).toBe(SLOT_UNLOCK_GOLD_BASE);
    expect(slotUnlockGoldCost(1)).toBe(SLOT_UNLOCK_GOLD_BASE + SLOT_UNLOCK_GOLD_STEP);
    expect(SLOT_UNLOCK_GOLD_BASE).toBe(50_000_000); // 첫 칸 5천만
    expect(SLOT_UNLOCK_GOLD_BASE + SLOT_UNLOCK_GOLD_STEP).toBe(100_000_000); // 확장 시 둘째 1억
    // 첫 칸 = base 골드 필요(무료 아님).
    expect(canUnlockSlot("village", 0, SLOT_UNLOCK_GOLD_BASE).ok).toBe(true);
    expect(canUnlockSlot("village", 0, SLOT_UNLOCK_GOLD_BASE - 1).ok).toBe(false);
    // 마을 판 다 참(1칸) → atMax(골드 무관).
    expect(canUnlockSlot("village", 1, 9_999_999_999)).toMatchObject({
      ok: false,
      atMax: true,
    });
  });

  it("applyUpgradeCost — 비용만큼 차감, 음수로 안 감", () => {
    const cost = UPGRADE_COST.village!;
    const after = applyUpgradeCost("village", { crop: 500, ore: 300 });
    expect(after.crop).toBe(500 - cost.crop!);
    expect(after.ore).toBe(300 - cost.ore!);
    // 부족해도 음수 안 됨(0 클램프).
    expect(applyUpgradeCost("village", { crop: 10 }).crop).toBe(0);
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
    expect(terrainTraitOf("kingdom_blackforge")).toBe("mine");
    expect(terrainTraitOf("war_central_mine")).toBe("mine");
    // 마을 type → farmland(숲)
    expect(terrainTraitOf("kingdom_sunderhold")).toBe("farmland");
    expect(terrainTraitOf("village_wheatfield")).toBe("farmland");
    // 요새/탑 → 평지
    expect(terrainTraitOf("war_central_fort")).toBe("plain");
    expect(terrainTraitOf("war_central_tower")).toBe("plain");
    // 물 테마 오버라이드 → lake(어장)(마을 type 이지만)
    expect(terrainTraitOf("city_river_haven")).toBe("lake");
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
