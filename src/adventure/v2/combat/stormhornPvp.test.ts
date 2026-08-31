import { afterEach, describe, expect, it, vi } from "vitest";

import type { V2SkillsState } from "@/adventure/data/v2/v2Skills";
import type { SignatureEffect } from "@/adventure/data/v2/v2Equipment";
import {
  castV2SkillOnAttackerTurnPvP,
  initialBattleStatePvP,
} from "./engine-pvp";
import type { PlayerCombat } from "./engine";

const DIRECT_DAMAGE_SKILL: V2SkillsState = {
  learned: ["v2_skill_strike"],
  equipped: ["v2_skill_strike"],
};
const EMPTY_SKILLS: V2SkillsState = { learned: [], equipped: [] };
const STORMHORN: SignatureEffect = {
  trigger: "on_hit_taken",
  label: "폭풍뿔",
  defGainOnHitPct: 38,
};

const ATTACKER: PlayerCombat = {
  hp: 10_000,
  maxHp: 10_000,
  mp: 1_000,
  maxMp: 1_000,
  atk: 1_000,
  def: 20,
  spd: 100,
  evasionPct: 0,
  accuracyPct: 100,
  attackCount: 1,
};

const DEFENDER: PlayerCombat = {
  hp: 10_000,
  maxHp: 10_000,
  mp: 1_000,
  maxMp: 1_000,
  atk: 10,
  def: 500,
  spd: 10,
  evasionPct: 0,
  accuracyPct: 100,
  attackCount: 1,
  equipSignatures: [STORMHORN],
};

afterEach(() => vi.restoreAllMocks());

describe("폭풍뿔 PvP 직접 피해 스킬 피격", () => {
  it("실제 HP 피해의 38%만큼 기본 방어력 상한 안에서 방어가 누적된다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const initial = initialBattleStatePvP(
      ATTACKER,
      DEFENDER,
      "공격자",
      "수비자",
      DIRECT_DAMAGE_SKILL,
      EMPTY_SKILLS,
    );

    const next = castV2SkillOnAttackerTurnPvP(initial, "p1").state;
    const hpDamage = DEFENDER.hp - next.p2.hp;
    const expectedGain = Math.min(
      DEFENDER.def,
      Math.floor((hpDamage * 38) / 100),
    );

    expect(hpDamage).toBeGreaterThan(0);
    expect(expectedGain).toBeGreaterThan(0);
    expect(next.p2.stacks.braceDefBonus).toBe(expectedGain);
    expect(next.log.some((entry) =>
      entry.text.includes(`[폭풍뿔] 수비자 방어 +${expectedGain}`),
    )).toBe(true);
  });
});
