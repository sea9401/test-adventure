import { describe, expect, it } from "vitest";

import {
  V2_SKILLS,
  describeV2Skill,
  type V2SkillId,
} from "@/adventure/data/v2/v2Skills";
import {
  damageBetween,
  resolveV2SkillCast,
  type V2SkillCastInput,
} from "./combatShared";
import {
  V2_PATTERN_DOT_POWER_MULT,
  V2_PATTERN_SKILL_MIN_BASIC_MULT_BY_TIER,
} from "./combatPattern";

const SKILL_ID = "v2c_venomist_toxiccloud" satisfies V2SkillId;

function cast(poisonStacks: number, applyProcInPattern: boolean) {
  const input: V2SkillCastInput = {
    skills: { learned: [SKILL_ID], equipped: [SKILL_ID] },
    cooldowns: {},
    procRoll: 0,
    applyProcInPattern,
    combatPattern: {
      blocks: [
        {
          condition: { kind: "always" },
          action: { kind: "skill", skillId: SKILL_ID },
        },
      ],
    },
    attacker: {
      mp: 999,
      atk: 500,
      luk: 500,
      maxHp: 5_000,
      currentHp: 5_000,
      maxMp: 999,
      selfBuffs: {},
      selfDebuffs: {},
    },
    target: {
      def: 300,
      maxHp: 10_000,
      currentHp: 10_000,
      poisonStacks,
      selfBuffs: {},
      selfDebuffs: {},
    },
  };
  return resolveV2SkillCast(input);
}

function poisonEffects() {
  const effects = V2_SKILLS[SKILL_ID].effects;
  const dot = effects.find((effect) => effect.kind === "dot");
  const payoff = effects.find(
    (effect) => effect.kind === "stackPayoffDamage",
  );
  if (!dot || dot.kind !== "dot") throw new Error("poison dot missing");
  if (!payoff || payoff.kind !== "stackPayoffDamage") {
    throw new Error("poison payoff missing");
  }
  return { dot, payoff };
}

describe("중독 스택 회수", () => {
  it("운영처럼 패턴 발동 확률을 굴리면 확정 발동 전제 DoT 감쇠를 중복 적용하지 않는다", () => {
    const { dot } = poisonEffects();
    const procMode = cast(0, true).dotsToApplyToTarget[0];
    const guaranteedMode = cast(0, false).dotsToApplyToTarget[0];

    expect(procMode?.pctMaxHpPerStack).toBe(dot.pctMaxHpPerStack);
    expect(procMode?.flatPerStack).toBe(dot.flatPerStack);
    expect(guaranteedMode?.pctMaxHpPerStack).toBeCloseTo(
      dot.pctMaxHpPerStack * V2_PATTERN_DOT_POWER_MULT,
    );
  });

  it("첫 시전부터 이번에 추가한 중독 스택의 방어 무시 추가 피해가 적용된다", () => {
    const { dot, payoff } = poisonEffects();
    const result = cast(0, true);
    const basicFloor = damageBetween(500, 300);

    expect(result.enemyDamage).toBe(
      Math.round(
        basicFloor * V2_PATTERN_SKILL_MIN_BASIC_MULT_BY_TIER[2],
      ) +
        dot.stacks * payoff.perStackFlat,
    );
  });

  it("기존 스택과 이번 시전 스택의 합은 중독 최대 스택에서 멈춘다", () => {
    const { dot, payoff } = poisonEffects();
    const empty = cast(0, true);
    const nearlyFull = cast(dot.maxStacks - 1, true);
    const newlyCountedAtEmpty = dot.stacks;
    const newlyCountedAtCap = dot.maxStacks;

    expect(nearlyFull.enemyDamage - empty.enemyDamage).toBe(
      (newlyCountedAtCap - newlyCountedAtEmpty) * payoff.perStackFlat,
    );
  });

  it("스킬 상세에 대상 행동 기준 지속시간·최대 스택·이번 시전 회수를 알린다", () => {
    const chips = describeV2Skill(V2_SKILLS[SKILL_ID]);

    expect(chips).toContain(
      "중독 지속피해 +3스택 (대상 행동 5회, 최대 10스택, 보스 최대 HP 비례분 50%)",
    );
    expect(chips.some((chip) => chip.includes("스택당 방어 무시"))).toBe(true);
    expect(chips).toContain("중첩 폭발에 이번 시전 스택 포함");
  });
});
