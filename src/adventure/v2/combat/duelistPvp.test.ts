import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlayerCombat } from "./engine";
import {
  advanceTurnPvP,
  castV2SkillOnAttackerTurnPvP,
  initialBattleStatePvP,
} from "./engine-pvp";

const declarations = [
  "v2c_duelist_declaration",
  "v2c_contender_insight",
  "v2c_undefeated_momentum",
  "v2c_grandchampion_hour",
] as const;

const attacker: PlayerCombat = {
  hp: 1_000,
  maxHp: 1_000,
  maxMp: 200,
  mp: 200,
  atk: 100,
  def: 10,
  spd: 100,
  evasionPct: 0,
  accuracyPct: 100,
  attackCount: 2,
  critChancePct: 0,
  critMult: 2,
  duelistStanceBonusPct: 50,
  basicDefPenetrationPct: 10,
};

const defender: PlayerCombat = {
  ...attacker,
  hp: 10_000,
  maxHp: 10_000,
  atk: 1,
  def: 40,
  attackCount: 1,
  duelistStanceBonusPct: 0,
  basicDefPenetrationPct: 0,
};

function castDeclaration() {
  const initial = initialBattleStatePvP(
    attacker,
    defender,
    "챔피언",
    "훈련 상대",
    { learned: [...declarations], equipped: [...declarations] },
  );
  return castV2SkillOnAttackerTurnPvP(initial, "p1").state;
}

afterEach(() => vi.restoreAllMocks());

describe("결투가 PvP", () => {
  it("최고 선언만 시전해 PvE와 같은 계보 효과를 합성한다", () => {
    const state = castDeclaration();
    expect(state.p1.duelistBuff).toMatchObject({
      declarationId: "v2c_grandchampion_hour",
      chainCount: 4,
      remainingBasicHits: 5,
      basicDamagePct: 15,
      basicDefPenetrationPct: 15,
      rampPctPerPriorHit: 5,
      basicCritMultAdd: 0.25,
      basicCritChanceCap: 95,
    });
    expect(state.log.filter((entry) => entry.text.includes("[계보 연계 4단계]"))).toHaveLength(1);
  });

  it("관통·태세·선언·연속타 계산과 횟수 소비가 PvE와 대칭이다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    const cast = castDeclaration();
    const first = advanceTurnPvP(cast, { kind: "attack" });
    expect(cast.p2.hp - first.p2.hp).toBe(120);
    expect(first.p1.duelistBuff).toMatchObject({
      remainingBasicHits: 4,
      landedBasicHits: 1,
    });
    expect(first.log.some((entry) =>
      entry.text === "[선언 유지] 챔피언의 시간 · 남은 평타 4회 · 다음 연속 +5%"
    )).toBe(true);

    const sameBundle = {
      ...first,
      phase: "p1" as const,
      p1: { ...first.p1, attacksLeft: 1 },
    };
    const second = advanceTurnPvP(sameBundle, { kind: "attack" });
    expect(sameBundle.p2.hp - second.p2.hp).toBe(126);
    expect(second.p1.duelistBuff).toMatchObject({
      remainingBasicHits: 3,
      landedBasicHits: 2,
    });
  });
});
