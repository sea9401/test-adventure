import { afterEach, describe, expect, it, vi } from "vitest";
import type { Monster } from "@/adventure/data/monsters";
import { POTIONS } from "@/adventure/data/potions";
import type { V2SkillsState } from "@/adventure/data/v2/v2Skills";
import { applyPlayerV2SkillCast, initialBattleState } from "./engine";
import { resolvePlayerPhase } from "./engine.playerPhase";
import type { PlayerCombat } from "./engineState";

const enemy: Monster = {
  name: "갑옷 훈련 인형",
  tags: [],
  hp: 10_000,
  atk: 1,
  def: 40,
  spd: 1,
  exp: 0,
  drops: [],
};

const player: PlayerCombat = {
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

const declarations = [
  "v2c_duelist_declaration",
  "v2c_contender_insight",
  "v2c_undefeated_momentum",
  "v2c_grandchampion_hour",
] as const;

function castDeclaration() {
  const skills: V2SkillsState = {
    learned: [...declarations],
    equipped: [...declarations],
  };
  const initial = initialBattleState(player, enemy, "챔피언", skills);
  return applyPlayerV2SkillCast(initial, player, {
    selfBuffs: {},
    selfDebuffs: {},
    enemyDebuffs: {},
  });
}

afterEach(() => vi.restoreAllMocks());

describe("결투가 PvE", () => {
  it("최고 선언만 시전해 하위 세 효과를 5회로 합성하고 한 줄로 기록한다", () => {
    const cast = castDeclaration();
    expect(cast.castFired).toBe(true);
    expect(cast.state.playerMp).toBeLessThan(200);
    expect(cast.state.v2SkillCooldowns.v2c_grandchampion_hour).toBeGreaterThan(0);
    expect(cast.state.duelistBuff).toMatchObject({
      declarationId: "v2c_grandchampion_hour",
      chainCount: 4,
      remainingBasicHits: 5,
      basicDamagePct: 15,
      basicDefPenetrationPct: 15,
      rampPctPerPriorHit: 5,
      basicCritMultAdd: 0.25,
      basicCritChanceCap: 95,
    });
    expect(cast.state.log.filter((entry) => entry.text.includes("[계보 연계 4단계]"))).toHaveLength(1);
  });

  it("관통 후 방어 → 태세 → 선언 → 연속타 순서로 각 평타를 계산하고 소비한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    const cast = castDeclaration();
    const ready = { ...cast.state, playerAttacksLeft: 2 };
    const first = resolvePlayerPhase(ready, player, "챔피언", { kind: "attack" });
    // DEF 40 × (1-25%) = 30, 100-30=70, 태세 1.5=105, 선언 1.15=120.
    expect(ready.enemyHp - first.enemyHp).toBe(120);
    expect(first.duelistBuff).toMatchObject({ remainingBasicHits: 4, landedBasicHits: 1 });
    expect(first.log.at(-1)?.text).toBe(
      "[선언 유지] 챔피언의 시간 · 남은 평타 4회 · 다음 연속 +5%",
    );

    const second = resolvePlayerPhase(first, player, "챔피언", { kind: "attack" });
    // 두 번째 타격은 무패의 기세 +5%가 더해져 선언 총 +20%.
    expect(first.enemyHp - second.enemyHp).toBe(126);
    expect(second.duelistBuff).toMatchObject({ remainingBasicHits: 3, landedBasicHits: 2 });
  });

  it("챔피언의 시간은 평타 치명 상한 95%와 +0.25배를 적용한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.89);
    const critPlayer = { ...player, critChancePct: 90, attackCount: 1 };
    const cast = castDeclaration();
    const state = {
      ...cast.state,
      playerAttacksLeft: 1,
      enemyHp: enemy.hp,
    };
    const after = resolvePlayerPhase(state, critPlayer, "챔피언", { kind: "attack" });
    // 선언 치명 +15%p도 오버플로에 남는다: 120 × (2.0 + 0.25 + (105-75)×0.01) = 306.
    expect(state.enemyHp - after.enemyHp).toBe(306);
  });

  it("정점의 감각은 선언 없이도 평타 치명 상한을 85%로 높인다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.79);
    const instinctPlayer = {
      ...player,
      attackCount: 1,
      critChancePct: 80,
      basicCritChanceCap: 85,
    };
    const state = {
      ...initialBattleState(instinctPlayer, enemy, "챔피언"),
      playerAttacksLeft: 1,
    };
    const after = resolvePlayerPhase(state, instinctPlayer, "챔피언", {
      kind: "attack",
    });
    // 정밀한 일격 관통 후 (100-36) × 태세 1.5 = 96, 치명 배율 2.0 + 기존 75% 초과 5% = 2.05.
    expect(state.enemyHp - after.enemyHp).toBe(196);
  });

  it("물약은 남은 횟수를 지키면서 연속타 단계만 초기화한다", () => {
    const cast = castDeclaration();
    const state = {
      ...cast.state,
      playerAttacksLeft: 2,
      duelistBuff: { ...cast.state.duelistBuff!, landedBasicHits: 3 },
    };
    const after = resolvePlayerPhase(state, player, "챔피언", {
      kind: "use_potion",
      potionId: "potion_heal_s",
      potion: POTIONS.potion_heal_s,
    });
    expect(after.duelistBuff).toMatchObject({ remainingBasicHits: 5, landedBasicHits: 0 });
  });
});
