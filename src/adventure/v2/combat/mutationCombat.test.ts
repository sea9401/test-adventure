import { describe, expect, it } from "vitest";
import {
  clampMutationResource,
  effectiveMutationDef,
  mutationCastTransition,
  stoneskinDefMultiplier,
  weightPhysicalSkillMultiplier,
  weightSpeedMultiplier,
} from "./mutationCombat";

describe("mutation battle resources", () => {
  it("중량과 분열체를 전투 상한 0..3으로 정규화한다", () => {
    expect(clampMutationResource(-1)).toBe(0);
    expect(clampMutationResource(2.9)).toBe(2);
    expect(clampMutationResource(9)).toBe(3);
  });

  it("중량은 스택당 물리 스킬 +5%, 속도 -5%를 적용한다", () => {
    expect(weightPhysicalSkillMultiplier(0)).toBe(1);
    expect(weightPhysicalSkillMultiplier(3)).toBe(1.15);
    expect(weightSpeedMultiplier(3)).toBe(0.85);
  });

  it("돌가죽은 중량당 방어력 6%를 적용한다", () => {
    expect(stoneskinDefMultiplier(3, 6)).toBe(1.18);
    expect(stoneskinDefMultiplier(3, 0)).toBe(1);
    expect(effectiveMutationDef(100, 3, 6)).toBe(118);
  });

  it("마무리기는 기존 자원을 모두 소비하고 생성기는 피해 뒤 자원을 얻는다", () => {
    expect(
      mutationCastTransition({ weight: 2, split: 1 }, { weightGain: 1 }),
    ).toMatchObject({
      weightAfter: 3,
      weightGained: 1,
      weightConsumed: 0,
    });
    expect(
      mutationCastTransition(
        { weight: 3, split: 3 },
        { consumeWeight: true, consumeSplit: true },
      ),
    ).toEqual({
      weightAfter: 0,
      splitAfter: 0,
      weightGained: 0,
      weightConsumed: 3,
      splitGained: 0,
      splitConsumed: 3,
    });
  });
});
