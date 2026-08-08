import { describe, expect, it } from "vitest";
import { applyLevelTargetGrant } from "./levelTargetGrant";

describe("applyLevelTargetGrant", () => {
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
