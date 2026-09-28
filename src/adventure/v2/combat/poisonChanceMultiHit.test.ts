import { afterEach, describe, expect, it, vi } from "vitest";
import type { Monster } from "@/adventure/data/monsters";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";
import type { V2SkillId, V2SkillsState } from "@/adventure/data/v2/v2Skills";
import { derivePlayerCombatV2Pure } from "@/lib/server/derivePlayerCombatV2";
import { applyPlayerV2SkillCast, initialBattleState } from "./engine";
import { castV2SkillOnAttackerTurnPvP, initialBattleStatePvP } from "./engine-pvp";

afterEach(() => vi.restoreAllMocks());

const monster: Monster = {
  name: "검증 대상", hp: 1_000_000, atk: 1, def: 0, spd: 1, exp: 0, drops: [], tags: [],
};

function cast(
  skillId: V2SkillId,
  roll: number,
  pvp: boolean,
  itemId: "v2_abyssruin_sig_pincer_gloves" | "v2_crafted_venom_gland_dagger",
) {
  vi.spyOn(Math, "random").mockReturnValue(roll);
  const item = V2_EQUIPMENT[itemId];
  const player = {
    ...derivePlayerCombatV2Pure({
      level: 72,
      v2Equipped: itemId === "v2_abyssruin_sig_pincer_gloves"
        ? { gloves: itemId }
        : { weapon: itemId },
    }).player,
    hp: 10_000, maxHp: 10_000, mp: 10_000, maxMp: 10_000,
    atk: 1_000, strStat: 100, critChancePct: 0, attackCount: 1,
    extraAttackChancePct: 0, skillProcChanceAdd: 100,
  };
  const skills: V2SkillsState = {
    learned: [skillId], equipped: [skillId],
    pattern: { blocks: [{ condition: { kind: "always" }, action: { kind: "skill", skillId } }] },
  };
  if (pvp) {
    const state = initialBattleStatePvP(
      player,
      { ...player, hp: monster.hp, maxHp: monster.hp, atk: 1, spd: 1, equipSignatures: [] },
      "공격자", "방어자", skills,
    );
    const result = castV2SkillOnAttackerTurnPvP(state, "p1");
    return {
      fired: result.castFired,
      stacks: result.state.p2.v2Dots.find((dot) => dot.tag === "poison")?.stacks ?? 0,
      logs: result.state.log.filter((entry) => entry.text.includes(`[${item.signature?.label}]`)),
      hits: result.state.log.filter((entry) =>
        entry.kind === "player_attack" && entry.text.includes("피해를 입혔다"),
      ).length,
    };
  }
  const state = initialBattleState(player, monster, "공격자", skills);
  const result = applyPlayerV2SkillCast(state, player, {
    selfBuffs: {}, selfDebuffs: {}, enemyDebuffs: {},
  });
  return {
    fired: result.castFired,
    stacks: result.state.enemyV2Dots.find((dot) => dot.tag === "poison")?.stacks ?? 0,
    logs: result.state.log.filter((entry) => entry.text.includes(`[${item.signature?.label}]`)),
    hits: result.state.log.filter((entry) =>
      entry.kind === "player_attack" && entry.text.includes("피해를 입혔다"),
    ).length,
  };
}

describe.each([false, true])("중독 장비 다타격 확률 PvP=%s", (pvp) => {
  it.each([
    ["v2_abyssruin_sig_pincer_gloves", "v2c_beastkin_clawflurry", 3, 0.35],
    ["v2_abyssruin_sig_pincer_gloves", "v2c_celestialdragon_combo", 5, 0.35],
    ["v2_crafted_venom_gland_dagger", "v2c_warrior_flurry", 3, 0.25],
  ] as const)("%s로 %s %i타를 쓸 때 확률 %.2f를 시전당 한 번만 판정한다", (itemId, skillId, hitCount, chance) => {
    const success = cast(skillId, chance - 0.01, pvp, itemId);
    vi.restoreAllMocks();
    const failure = cast(skillId, chance, pvp, itemId);
    expect(success.fired).toBe(true);
    expect(success.hits).toBe(hitCount);
    expect(success.stacks).toBe(1);
    expect(success.logs).toHaveLength(1);
    expect(failure.fired).toBe(true);
    expect(failure.hits).toBe(hitCount);
    expect(failure.stacks).toBe(0);
    expect(failure.logs).toHaveLength(0);
  });
});
