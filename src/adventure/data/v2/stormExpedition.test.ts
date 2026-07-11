import { describe, expect, it } from "vitest";
import {
  STORM_EXPEDITION_DAILY_ATTEMPTS,
  STORM_EXPEDITION_ROUTES,
  parseStormExpeditionState,
  stormExpeditionEnemy,
  stormExpeditionStageReward,
} from "./stormExpedition";

describe("stormExpedition", () => {
  it("새 날짜에는 입장 횟수만 초기화하고 진행 중 원정은 보존한다", () => {
    const state = parseStormExpeditionState({
      date: "2026-07-10",
      attemptsUsed: 3,
      clears: 2,
      active: {
        routeId: "gale",
        stage: 2,
        hp: 123,
        mp: 45,
        pendingGold: 46_000,
      },
    }, "2026-07-11");

    expect(state.attemptsUsed).toBe(0);
    expect(state.clears).toBe(2);
    expect(state.active).toEqual({
      routeId: "gale",
      stage: 2,
      hp: 123,
      mp: 45,
      pendingGold: 46_000,
    });
  });

  it("손상된 저장값을 안전한 범위로 정규화한다", () => {
    const state = parseStormExpeditionState({
      date: "2026-07-11",
      attemptsUsed: 999,
      clears: -4,
      active: { routeId: "unknown", stage: 99 },
    }, "2026-07-11");

    expect(state.attemptsUsed).toBe(STORM_EXPEDITION_DAILY_ATTEMPTS);
    expect(state.clears).toBe(0);
    expect(state.active).toBeNull();
  });

  it("세 항로가 서로 다른 전투 성격과 우두머리를 가진다", () => {
    expect(STORM_EXPEDITION_ROUTES.map((route) => route.id)).toEqual([
      "gale",
      "thunder",
      "wreckage",
    ]);

    const gale = stormExpeditionEnemy("gale", 3);
    const thunder = stormExpeditionEnemy("thunder", 3);
    const wreckage = stormExpeditionEnemy("wreckage", 3);
    expect(gale.evasionPct).toBeGreaterThan(wreckage.evasionPct ?? 0);
    expect(thunder.atkType).toBe("magic");
    expect(thunder.v2Skills?.equipped.length).toBeGreaterThan(1);
    expect(wreckage.def).toBeGreaterThan(gale.def);
    expect(new Set([gale.name, thunder.name, wreckage.name]).size).toBe(3);
  });

  it("깊은 구간일수록 확보 가능한 골드가 증가한다", () => {
    const rewards = [0, 1, 2, 3].map(stormExpeditionStageReward);
    expect(rewards).toEqual([18_000, 28_000, 42_000, 72_000]);
    expect(rewards.reduce((sum, reward) => sum + reward, 0)).toBe(160_000);
  });
});
