import { describe, expect, it } from "vitest";
import {
  GUILD_FACILITY_OPERATIONS_WEEKLY_CAP,
  accrueGuildFacilityOperationsState,
  guildFacilityOperationAccrual,
  guildFacilityOperationsComplete,
  guildFacilityOperationsRequired,
  normalizeGuildFacilityOperationsState,
} from "./guildFacilityOperations";

const base = normalizeGuildFacilityOperationsState(null, {
  currentLevel: 5,
  weekKey: "2026-10-12",
});

describe("길드 시설 운영 실적", () => {
  it("단계별 목표", () => {
    expect(GUILD_FACILITY_OPERATIONS_WEEKLY_CAP).toBe(100);
    expect([5, 6, 7, 8, 9, 10, 11].map(guildFacilityOperationsRequired)).toEqual([
      0, 200, 250, 300, 350, 400, 0,
    ]);
  });

  it("Lv.5에서 다음 목표 200점", () => {
    expect(base).toEqual({ targetLevel: 6, points: 0, weekKey: "2026-10-12", weekPoints: 0 });
  });

  it("주간 상한 100점", () => {
    const r = accrueGuildFacilityOperationsState({ ...base, weekPoints: 95 }, 8, {
      currentLevel: 5,
      maxLevel: 10,
    });
    expect(r.accrued).toBe(5);
    expect(r.state.weekPoints).toBe(100);
    expect(r.state.points).toBe(5);
  });

  it("목표에서 멈추고 이월 없음", () => {
    const r = accrueGuildFacilityOperationsState({ ...base, points: 198 }, 8, {
      currentLevel: 5,
      maxLevel: 10,
    });
    expect(r.accrued).toBe(2);
    expect(guildFacilityOperationsComplete(r.state)).toBe(true);
  });

  it("Lv.5 미만과 최대 레벨은 적립하지 않음", () => {
    expect(
      accrueGuildFacilityOperationsState(base, 8, { currentLevel: 4, maxLevel: 10 }).accrued,
    ).toBe(0);
    const lv10 = normalizeGuildFacilityOperationsState(null, {
      currentLevel: 10,
      weekKey: "2026-10-12",
    });
    expect(
      accrueGuildFacilityOperationsState(lv10, 8, { currentLevel: 10, maxLevel: 10 }).accrued,
    ).toBe(0);
    expect(guildFacilityOperationsComplete(lv10)).toBe(false);
  });

  it("레벨이 오르면 점수는 0, 같은 주 적립량은 유지", () => {
    const next = normalizeGuildFacilityOperationsState(
      { targetLevel: 6, points: 200, weekKey: "2026-10-12", weekPoints: 70 },
      { currentLevel: 6, weekKey: "2026-10-12" },
    );
    expect(next).toEqual({ targetLevel: 7, points: 0, weekKey: "2026-10-12", weekPoints: 70 });
  });

  it("주가 바뀌면 주간 적립량 초기화", () => {
    const next = normalizeGuildFacilityOperationsState(
      { targetLevel: 6, points: 120, weekKey: "2026-10-05", weekPoints: 100 },
      { currentLevel: 5, weekKey: "2026-10-12" },
    );
    expect(next.points).toBe(120);
    expect(next.weekPoints).toBe(0);
  });

  it("활동별 적립", () => {
    expect(guildFacilityOperationAccrual("training_drill_claim")).toEqual({
      buildingId: "training_ground",
      points: 1,
    });
    expect(guildFacilityOperationAccrual("exploration_expedition_claim")).toEqual({
      buildingId: "exploration_hq",
      points: 8,
    });
    expect(guildFacilityOperationAccrual("exploration_weekly_claim")?.points).toBe(3);
    expect(guildFacilityOperationAccrual("exploration_event_resolve")?.points).toBe(2);
    expect(guildFacilityOperationAccrual("dining_meal")).toEqual({
      buildingId: "dining_hall",
      points: 2,
    });
    expect(guildFacilityOperationAccrual("dining_ingredient_donation", 37)?.points).toBe(3);
    expect(guildFacilityOperationAccrual("alchemy_craft", 14)).toEqual({
      buildingId: "alchemy_workshop",
      points: 14,
    });
    expect(guildFacilityOperationAccrual("trade_delivery", 59)).toEqual({
      buildingId: "trade_post",
      points: 5,
    });
    expect(guildFacilityOperationAccrual("trade_contract_complete")?.points).toBe(10);
    expect(guildFacilityOperationAccrual("trade_delivery", 9)).toBeNull();
    expect(guildFacilityOperationAccrual("alchemy_craft")).toBeNull();
    expect(guildFacilityOperationAccrual("gold_deposit")).toBeNull();
  });
});
