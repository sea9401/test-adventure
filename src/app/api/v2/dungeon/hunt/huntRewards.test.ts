import { describe, expect, it } from "vitest";
import {
  applyLiberationPostHuntRestore,
  applyChargeRestore,
  computeBattleRewards,
  multiplyHuntReward,
  normalizeHuntBattleCount,
  rareMapRewardRolls,
} from "./huntRewards";

describe("희귀 탐사 압축 보상 횟수", () => {
  const map = {
    iid: "rm-compressed",
    kind: "worn_map" as const,
    depth: 84,
    runsLeft: 30,
    foundAt: 1,
  };

  it("승리하면 저장된 남은 횟수 전체를 보상 추첨 횟수로 쓴다", () => {
    // Break caught: compressed settlement awards only one old hunt reward.
    expect(rareMapRewardRolls(map, true)).toBe(30);
    expect(multiplyHuntReward(3_285, 30)).toBe(98_550);
  });

  it("패배와 일반 사냥은 보상 횟수를 늘리지 않는다", () => {
    // Break caught: a failed expedition grants its stored reward rolls.
    expect(rareMapRewardRolls(map, false)).toBe(1);
    expect(rareMapRewardRolls(null, true)).toBe(1);
  });

  it("희귀 탐사 요청은 클라이언트 count와 무관하게 실제 전투 한 번만 허용한다", () => {
    // Break caught: a stale batch setting resolves 30 actual rare-map combats.
    expect(normalizeHuntBattleCount(50, "rm-compressed")).toBe(1);
    expect(normalizeHuntBattleCount(10, null)).toBe(10);
  });
});

describe("applyChargeRestore", () => {
  it("HP가 0이어도 보유 충전량으로 자동 회복한다", () => {
    const result = applyChargeRestore({
      afterHp: 0,
      afterMp: 10,
      maxHp: 100,
      maxMp: 20,
      hpCharges: 60,
      mpCharges: 0,
    });

    expect(result.afterHp).toBe(60);
    expect(result.hpCharges).toBe(0);
  });

  it("설정한 목표 체력까지만 HP 충전약을 사용한다", () => {
    const result = applyChargeRestore({
      afterHp: 20,
      afterMp: 10,
      maxHp: 101,
      maxMp: 20,
      hpCharges: 100,
      mpCharges: 0,
      hpTargetPct: 50,
    });

    expect(result.afterHp).toBe(51);
    expect(result.hpCharges).toBe(69);
  });

  it("현재 체력이 목표 이상이면 HP 충전약을 사용하지 않는다", () => {
    const result = applyChargeRestore({
      afterHp: 70,
      afterMp: 10,
      maxHp: 100,
      maxMp: 20,
      hpCharges: 100,
      mpCharges: 0,
      hpTargetPct: 50,
    });

    expect(result.afterHp).toBe(70);
    expect(result.hpCharges).toBe(100);
  });

  it("설정한 목표 마나까지만 MP 충전약을 사용한다", () => {
    const result = applyChargeRestore({
      afterHp: 100,
      afterMp: 20,
      maxHp: 100,
      maxMp: 101,
      hpCharges: 0,
      mpCharges: 100,
      mpTargetPct: 50,
    });

    expect(result.afterMp).toBe(51);
    expect(result.mpCharges).toBe(69);
  });

  it("현재 마나가 목표 이상이면 MP 충전약을 사용하지 않는다", () => {
    const result = applyChargeRestore({
      afterHp: 100,
      afterMp: 70,
      maxHp: 100,
      maxMp: 100,
      hpCharges: 0,
      mpCharges: 100,
      mpTargetPct: 50,
    });

    expect(result.afterMp).toBe(70);
    expect(result.mpCharges).toBe(100);
  });
});

describe("computeBattleRewards 해방 배율", () => {
  it("기존 EXP·골드 계산 결과에 각각 해방 배율을 한 번 적용한다", () => {
    const base = computeBattleRewards({
      won: true,
      enemyMonster: { exp: 100 },
      battleCount: 100_000,
      mapExpMult: 1,
      mapGoldMult: 1,
    });
    const boosted = computeBattleRewards({
      won: true,
      enemyMonster: { exp: 100 },
      battleCount: 100_000,
      mapExpMult: 1,
      mapGoldMult: 1,
      liberationExpPct: 20,
      liberationGoldPct: 10,
    });

    expect(boosted.expGained).toBe(Math.round(base.expGained * 1.2));
    expect(boosted.goldGross).toBe(Math.round(base.goldGross * 1.1));
  });
});

describe("applyLiberationPostHuntRestore", () => {
  it("승리 때 최대치 비율만큼 회복하고 상한을 지킨다", () => {
    expect(
      applyLiberationPostHuntRestore({
        won: true,
        afterHp: 850,
        afterMp: 40,
        maxHp: 1_000,
        maxMp: 100,
        hpPct: 20,
        mpPct: 10,
      }),
    ).toEqual({ afterHp: 1_000, afterMp: 50 });
  });

  it("패배 때는 회복하지 않는다", () => {
    expect(
      applyLiberationPostHuntRestore({
        won: false,
        afterHp: 850,
        afterMp: 40,
        maxHp: 1_000,
        maxMp: 100,
        hpPct: 20,
        mpPct: 10,
      }),
    ).toEqual({ afterHp: 850, afterMp: 40 });
  });
});
