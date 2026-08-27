import { describe, expect, it } from "vitest";
import { applyLevelTargetGrant } from "./levelTargetGrant";

describe("applyLevelTargetGrant", () => {
  it("신형 생애는 목표 레벨까지 실제 HP·MP 굴림을 함께 누적한다", () => {
    const result = applyLevelTargetGrant(
      { class: "warrior", level: 1, exp: 0 },
      {
        lifeResourceGrowth: {
          version: 1,
          rolledLevel: 1,
          baseHp: 120,
          baseMp: 65,
          gainedHp: 0,
          gainedMp: 0,
        },
      },
      3,
      () => 0,
    );

    expect(result).toMatchObject({ levelsGained: 2, hpGain: 16, mpGain: 6 });
    expect(result.proficiency.lifeResourceGrowth).toMatchObject({
      rolledLevel: 3,
      gainedHp: 16,
      gainedMp: 6,
    });
  });

  it("레거시 생애는 기존 자원 증가 표시만 반환하고 기록을 만들지 않는다", () => {
    const result = applyLevelTargetGrant(
      { class: "warrior", level: 1, exp: 0 },
      {},
      3,
      () => 0,
    );

    expect(result.proficiency.lifeResourceGrowth).toBeUndefined();
    expect(result.hpGain).toBeGreaterThan(0);
    expect(result.mpGain).toBeGreaterThan(0);
  });

  it("1레벨 캐릭터를 정확히 100레벨과 EXP 0으로 만든다", () => {
    const result = applyLevelTargetGrant(
      { class: "warrior", level: 1, exp: 29 },
      {},
      100,
      () => 0,
    );

    expect(result.level).toBe(100);
    expect(result.exp).toBe(0);
    expect(result.levelsGained).toBe(99);
  });

  it("중간 레벨에서는 남은 레벨 수만큼 성장 포인트를 적용한다", () => {
    const result = applyLevelTargetGrant(
      { class: "warrior", level: 73, exp: 456 },
      {},
      100,
      () => 0,
    );

    expect(result.levelsGained).toBe(27);
    expect(
      Object.values(result.proficiency.grown).reduce(
        (sum, value) => sum + value,
        0,
      ),
    ).toBe(81);
  });

  it("레벨을 올려도 직업 숙련도는 증가시키지 않는다", () => {
    const result = applyLevelTargetGrant(
      { class: "warrior", level: 50, exp: 0 },
      {},
      100,
      () => 0,
    );

    expect(result.proficiency.groups.warrior?.cumLevel ?? 0).toBe(0);
    expect(result.proficiency.jobCumLevel?.warrior ?? 0).toBe(0);
    expect(result.proficiency.statFloorLevels.warrior).toBe(50);
  });

  it("이미 목표 레벨이면 성장 없이 EXP만 0으로 정규화한다", () => {
    const result = applyLevelTargetGrant(
      { class: "warrior", level: 100, exp: 999 },
      {},
      100,
      () => 0,
    );

    expect(result).toMatchObject({ level: 100, exp: 0, levelsGained: 0 });
    expect(result.proficiency.grown).toEqual({});
  });
});
