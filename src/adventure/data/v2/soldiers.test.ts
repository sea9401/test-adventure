import { describe, it, expect } from "vitest";
import {
  applySoldierBoost,
  SOLDIER_ATK_PER,
  SOLDIER_COST_STONE,
  SOLDIER_HP_PER,
  SOLDIER_MAX_TOTAL,
} from "./soldiers";

function basePlayer() {
  // 만렙 비슷한 baseline.
  return {
    atk: 80,
    def: 50,
    spd: 12,
    hp: 1000,
    maxHp: 1000,
    extraHitsPct: 0,
    critPct: 0,
  } as unknown as Parameters<typeof applySoldierBoost>[0];
}

describe("병사 보정", () => {
  it("soldiers 0 → 항등", () => {
    const p = basePlayer();
    expect(applySoldierBoost(p, 0)).toBe(p);
  });

  it("100 병사 → atk +50, maxHp +500", () => {
    const r = applySoldierBoost(basePlayer(), 100);
    expect(r.atk).toBe(80 + 100 * SOLDIER_ATK_PER);
    expect(r.maxHp).toBe(1000 + 100 * SOLDIER_HP_PER);
  });

  it("음수 soldiers 도 항등 (방어 코드)", () => {
    const p = basePlayer();
    expect(applySoldierBoost(p, -50)).toBe(p);
  });

  it("hp 가 maxHp 초과 안 함", () => {
    const r = applySoldierBoost(basePlayer(), 50);
    expect(r.hp).toBeLessThanOrEqual(r.maxHp);
  });

  it("비용 상수 sanity", () => {
    expect(SOLDIER_COST_STONE).toBeGreaterThan(0);
    expect(SOLDIER_ATK_PER).toBeGreaterThan(0);
    expect(SOLDIER_HP_PER).toBeGreaterThan(0);
  });

  it("누적 상한 sanity", () => {
    expect(SOLDIER_MAX_TOTAL).toBeGreaterThan(0);
    // 1000/요청 cap 보다 작아야 cap 이 의미 있음.
    expect(SOLDIER_MAX_TOTAL).toBeLessThanOrEqual(1000);
  });
});
