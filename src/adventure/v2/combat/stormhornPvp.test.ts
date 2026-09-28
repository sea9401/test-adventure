import { afterEach, describe, expect, it, vi } from "vitest";

import type { V2SkillsState } from "@/adventure/data/v2/v2Skills";
import type { SignatureEffect } from "@/adventure/data/v2/v2Equipment";
import {
  advanceTurnPvP,
  attackerFacingDef,
  castV2SkillOnAttackerTurnPvP,
  initialBattleStatePvP,
} from "./engine-pvp";
import type { PlayerCombat } from "./engine";
import { toPvpReplayPayloadForSide } from "@/adventure/data/v2/replayPayload";

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

describe("직업 강체 PvP 피격 방어 누적", () => {
  it("일반 공격으로 받은 HP 피해의 30%를 방어에 더하고 다음 공격의 방어 계산에 사용한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const initial = initialBattleStatePvP(
      { ...ATTACKER, atk: 200 },
      { ...DEFENDER, def: 100, defGainOnHitPct: 30, equipSignatures: [] },
      "공격자",
      "수비자",
    );

    const next = advanceTurnPvP(initial);

    expect(next.p2.hp).toBe(9_900);
    expect(next.p2.stacks.braceDefBonus).toBe(30);
    expect(attackerFacingDef(next.p1, next.p2)).toBe(130);
    expect(next.log.find((entry) => entry.text.includes("[강체] 수비자 방어 +30")))
      .toMatchObject({ side: "p2" });
    const defenderReplay = toPvpReplayPayloadForSide(next, "p2", "공격자");
    expect(defenderReplay.log.find((entry) => entry.text.includes("[강체] 수비자 방어 +30")))
      .toMatchObject({ turn: "player" });

    const afterDefenderTurn = advanceTurnPvP(next);
    const afterSecondAttack = advanceTurnPvP(afterDefenderTurn);
    expect(afterSecondAttack.p2.hp).toBe(9_830);
  });

  it("직접 피해 스킬로 받은 HP 피해에도 강체와 장비 효과를 함께 누적하고 기록한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const initial = initialBattleStatePvP(
      ATTACKER,
      { ...DEFENDER, defGainOnHitPct: 20 },
      "공격자",
      "수비자",
      DIRECT_DAMAGE_SKILL,
      EMPTY_SKILLS,
    );

    const next = castV2SkillOnAttackerTurnPvP(initial, "p1").state;
    const hpDamage = DEFENDER.hp - next.p2.hp;
    const expectedGain = Math.min(DEFENDER.def, Math.floor((hpDamage * 58) / 100));

    expect(hpDamage).toBeGreaterThan(0);
    expect(next.p2.stacks.braceDefBonus).toBe(expectedGain);
    expect(next.log.some((entry) => entry.text.includes(`[강체 + 폭풍뿔] 수비자 방어 +${expectedGain}`))).toBe(true);
  });
});
