import { describe, it, expect } from "vitest";
import {
  simulateTroopBattle,
  computePlunder,
  DUEL_BONUS,
  DUEL_PENALTY,
  LOSER_CASUALTY_RATE,
  WINNER_CASUALTY_RATE,
  PLUNDER_RATE,
} from "./troopBattle";

describe("본 병사 전쟁 sim", () => {
  it("양측 동등 + 일기토 보정 없음 — 무승부 비슷한 power", () => {
    const r = simulateTroopBattle({
      attackerSoldiers: 100,
      defenderSoldiers: 100,
      attackerAtk: 50,
      defenderAtk: 50,
      // attackerWonDuel 가 결과를 좌우 — 보정만 차이
      attackerWonDuel: true,
    });
    // 공격자가 일기토 이김 → 보정으로 우세
    expect(r.attackerWon).toBe(true);
    expect(r.attackerPower).toBeGreaterThan(r.defenderPower);
  });

  it("일기토 패배해도 병사 우위면 본 전쟁 이길 수 있음", () => {
    const r = simulateTroopBattle({
      attackerSoldiers: 200, // 2배
      defenderSoldiers: 100,
      attackerAtk: 50,
      defenderAtk: 50,
      attackerWonDuel: false, // 일기토 졌음
    });
    // 200×10×0.8=1600 vs 100×10×1.2=1200 — atk 보정 무시해도 공격자 우세
    expect(r.attackerWon).toBe(true);
  });

  it("0 병사 + 일기토 이김 — atk 만으로도 power 0 아님", () => {
    const r = simulateTroopBattle({
      attackerSoldiers: 0,
      defenderSoldiers: 0,
      attackerAtk: 80,
      defenderAtk: 50,
      attackerWonDuel: true,
    });
    expect(r.attackerPower).toBeGreaterThan(0);
    expect(r.attackerWon).toBe(true);
  });

  it("사상자 — 승자 < 패자 비율", () => {
    const r = simulateTroopBattle({
      attackerSoldiers: 100,
      defenderSoldiers: 100,
      attackerAtk: 50,
      defenderAtk: 50,
      attackerWonDuel: true,
    });
    expect(r.attackerCasualties).toBe(Math.floor(100 * WINNER_CASUALTY_RATE));
    expect(r.defenderCasualties).toBe(Math.floor(100 * LOSER_CASUALTY_RATE));
    expect(r.attackerCasualties).toBeLessThan(r.defenderCasualties);
  });

  it("음수 입력 방어 — power 0, casualty 0", () => {
    const r = simulateTroopBattle({
      attackerSoldiers: -10,
      defenderSoldiers: -10,
      attackerAtk: -5,
      defenderAtk: -5,
      attackerWonDuel: true,
    });
    expect(r.attackerPower).toBe(0);
    expect(r.defenderPower).toBe(0);
    expect(r.attackerCasualties).toBe(0);
    expect(r.defenderCasualties).toBe(0);
  });

  it("DUEL_BONUS / DUEL_PENALTY 곱 = 1 미만 (전체적으로 작아짐, 균형용)", () => {
    // 1.2 × 0.8 = 0.96. 둘이 합산하면 baseline 보다 약간 작아짐.
    expect(DUEL_BONUS * DUEL_PENALTY).toBeCloseTo(0.96, 2);
  });

  it("약탈 — PLUNDER_RATE 적용", () => {
    expect(computePlunder(1000)).toBe(Math.floor(1000 * PLUNDER_RATE));
  });

  it("약탈 — 음수/0 stone 방어", () => {
    expect(computePlunder(0)).toBe(0);
    expect(computePlunder(-100)).toBe(0);
  });

  it("RNG 주입 시 결정론 — 같은 RNG → 같은 결과", () => {
    const seed = () => {
      const values = [0.1, 0.9];
      let i = 0;
      return () => values[i++ % values.length];
    };
    const inputs = {
      attackerSoldiers: 100,
      defenderSoldiers: 100,
      attackerAtk: 50,
      defenderAtk: 50,
      attackerWonDuel: true,
      noise: 0.1,
    };
    const r1 = simulateTroopBattle({ ...inputs, rng: seed() });
    const r2 = simulateTroopBattle({ ...inputs, rng: seed() });
    expect(r1).toEqual(r2);
  });

  it("RNG 가 다르면 power 도 다름 — noise 가 실제로 영향", () => {
    const inputs = {
      attackerSoldiers: 100,
      defenderSoldiers: 100,
      attackerAtk: 50,
      defenderAtk: 50,
      attackerWonDuel: true,
      noise: 0.1,
    };
    // 두 RNG 시퀀스 — 양극단. noise 효과가 보여야 함.
    const lowRng = () => 0.0; // 최저
    const highRng = () => 1.0; // 최고
    const rLow = simulateTroopBattle({ ...inputs, rng: lowRng });
    const rHigh = simulateTroopBattle({ ...inputs, rng: highRng });
    // 노이즈가 power 에 반영 — 둘이 같으면 noise 무의미.
    expect(rLow.attackerPower).not.toBe(rHigh.attackerPower);
  });
});
