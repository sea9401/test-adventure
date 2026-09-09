import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/adventure/data/v2/coreLoopConfig", async importOriginal => ({
  ...await importOriginal<typeof import("@/adventure/data/v2/coreLoopConfig")>(),
  V2_CORE_LOOP_V2: false,
}));
import type { Monster } from "@/adventure/data/monsters";
import type { V2SkillId } from "@/adventure/data/v2/v2Skills";
import { POTIONS } from "@/adventure/data/potions";
import { UNEXPLORED_SPECIALTY_TAG_SETS } from "@/adventure/data/v2/unexploredSpecialtyEquipment";
import { applyCounterIfAny, applyEnemyV2SkillCast, applyPlayerV2SkillCast, finishPlayerTurn, initialBattleState, playerPveEvasionReductionPct, resolveBattle, type BattleState, type PlayerCombat } from "./engine";
import { resolvePlayerPhase } from "./engine.playerPhase";
import { resolveEnemyPhase } from "./engine.enemyPhase";
import { resolveBattleAtb, tickPlayerDotsOnAction } from "./engine.atb";
import { afterimageShield, colonyRegeneration, ironWallDefGain, manaRedeployment, shouldQueueRevenge, unyieldingDamage } from "./unexploredSetEffects";

const PLAYER: PlayerCombat = { hp: 1000, maxHp: 1000, mp: 1000, maxMp: 1000, atk: 1, def: 0, spd: 50, evasionPct: 0, accuracyPct: 100, attackCount: 1 };
const ENEMY: Monster = { name: "표적", tags: [], hp: 100000, atk: 100, def: 0, spd: 1, exp: 0 };
const effects = (...kinds: NonNullable<PlayerCombat["unexploredSetEffects"]>[number]["kind"][]) =>
  UNEXPLORED_SPECIALTY_TAG_SETS.flatMap(set => set.thresholds.flatMap(t => "effect" in t && kinds.includes(t.effect.kind) ? [t.effect] : []));
const playerWith = (...kinds: Parameters<typeof effects>) => ({ ...PLAYER, unexploredSetEffects: effects(...kinds) });
function enemyState(player: PlayerCombat, atk = 100, hits = 1): BattleState {
  const state = initialBattleState(player, { ...ENEMY, atk }, "용사");
  return { ...state, phase: "enemy", turn: { ...state.turn, enemyAttacksLeft: hits } };
}
function hit(state: BattleState, player: PlayerCombat, entering = true) {
  return resolveEnemyPhase(state, player, "용사", entering);
}
function cast(state: BattleState, player: PlayerCombat) {
  return applyPlayerV2SkillCast(state, player, { selfBuffs: {}, selfDebuffs: {}, enemyDebuffs: {} });
}
const dot = (damage: number) => ({ tag: "bleed" as const, label: "출혈", stacks: 1, maxStacks: 10, turns: 2, flatPerStack: damage, atkCoefPerStack: 0, pctMaxHpPerStack: 0, sourceAtk: 0 });
afterEach(() => vi.restoreAllMocks());

// Removing any offensive hook must change actual HP, action counts, or statuses here.
describe("PvE unexplored offensive integration", () => {
  const attacker = (...kinds: Parameters<typeof effects>): PlayerCombat => ({ ...playerWith(...kinds), atk: 100 });
  const skillState = (player: PlayerCombat, skill: V2SkillId = "v2c_martial_combo", enemy = ENEMY) =>
    initialBattleState(player, enemy, "용사", { learned: [skill], equipped: [skill] });
  const ready = (state: BattleState): BattleState => ({ ...state, unexploredSetRuntime: { ...state.unexploredSetRuntime!, revengePending: true } });
  const attack = (state: BattleState, player: PlayerCombat) => resolvePlayerPhase(state, player, "용사", { kind: "attack" });
  const damageLines = (state: BattleState) => state.log.filter(e => e.kind === "player_attack" && / (\d+) 피해/.test(e.text)).map(e => Number(e.text.match(/ (\d+) 피해/)?.[1]));

  it("consumes revenge after boosting every direct hit of one multihit skill", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player = attacker("battle_revenge");
    const initial = ready(skillState(player));
    const next = cast(initial, player).state;
    expect(damageLines(next)).toEqual([31, 31, 31, 31, 31]);
    expect(next.enemyHp).toBe(99845);
    expect(next.unexploredSetRuntime?.revengePending).toBe(false);
    const second = cast(next, player).state;
    expect(next.enemyHp - second.enemyHp).toBe(130);
  });
  it("boosts manual basic direct damage but not independent damage or counterattacks", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player = { ...attacker("battle_revenge", "colossus_crush"), heavenDecreeChancePct: 100, counterAtkBonus: 10 };
    const initial = ready(initialBattleState(player, ENEMY, "용사"));
    const plain = attack({ ...initial, unexploredSetRuntime: { ...initial.unexploredSetRuntime!, revengePending: false } }, player);
    const next = attack(initial, player);
    expect(plain.enemyHp - next.enemyHp).toBe(20);
    const counter = applyCounterIfAny(initial, player);
    expect(counter.state.unexploredSetRuntime?.revengePending).toBe(true);
    expect(initial.enemyHp - counter.state.enemyHp).toBe(110);
  });
  it.each(["v2c_acolyte_smite", "v2c_warrior_warcry"] as const)("does not consume revenge or crystal on utility %s", skill => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player = { ...attacker("battle_revenge", "crystal_focus", "chain_drive", "frost_mark"), hp: 200 };
    const initial = ready(skillState(player, skill));
    const next = cast(initial, player);
    expect(next.castFired).toBe(true);
    expect(next.state.enemyHp).toBe(ENEMY.hp);
    expect(next.state.unexploredSetRuntime?.revengePending).toBe(true);
    expect(next.state.unexploredSetRuntime?.paidDirectSkillCount).toBe(0);
    expect(damageLines(next.state)).toEqual([]);
  });
  it("counts paid direct casts once per whole repeated multihit skill and resets third attempt", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player = attacker("crystal_focus");
    let state = skillState(player);
    state = { ...state, playerAttacksLeft: 2 };
    for (const [count, damage] of [[1, 260], [2, 260], [0, 320]]) {
      const next = cast(state, player).state;
      expect(state.enemyHp - next.enemyHp).toBe(damage);
      expect(next.unexploredSetRuntime?.paidDirectSkillCount).toBe(count);
      state = next;
    }
  });
  it("excludes fully cost-reduced casts and failed casts from crystal", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player = { ...attacker("crystal_focus"), mpCostReductionPct: 100 };
    let state = skillState(player);
    state = { ...state, unexploredSetRuntime: { ...state.unexploredSetRuntime!, paidDirectSkillCount: 2 } };
    const next = cast(state, player).state;
    expect(next.playerMp).toBe(1000);
    expect(next.unexploredSetRuntime?.paidDirectSkillCount).toBe(2);
    expect(state.enemyHp - next.enemyHp).toBe(130);
    expect(cast({ ...state, playerMp: 0 }, player).castFired).toBe(false);
  });
  it.each([0, 2])("crystal preserves count %i when the same direct cast restores its entire cost", count => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player = { ...attacker("crystal_focus"), mp: 10000, maxMp: 10000, magicAtk: 100 };
    const skills: V2SkillId[] = ["v2c_elementallord_surge", "v2c_elementallord_resonance"];
    let state = initialBattleState(player, ENEMY, "용사", { learned: skills, equipped: skills });
    state = { ...state, unexploredSetRuntime: { ...state.unexploredSetRuntime!, paidDirectSkillCount: count } };
    const next = cast(state, player);
    expect(next.castFired).toBe(true);
    expect(next.state.playerMp).toBe(10000);
    expect(next.state.unexploredSetRuntime?.paidDirectSkillCount).toBe(count);
    expect(state.enemyHp - next.state.enemyHp).toBe(175);
  });
  it("crystal counts only the positive remainder after a partial native mana restore", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player = { ...attacker("crystal_focus"), magicAtk: 100 };
    const skills: V2SkillId[] = ["v2c_elementallord_surge", "v2c_elementallord_resonance"];
    let state = initialBattleState(player, ENEMY, "용사", { learned: skills, equipped: skills });
    state = { ...state, unexploredSetRuntime: { ...state.unexploredSetRuntime!, paidDirectSkillCount: 2 } };
    const next = cast(state, player).state;
    expect(next.playerMp).toBe(856); // Normalized cost 194, 5% of max MP = 50 restored.
    expect(next.unexploredSetRuntime?.paidDirectSkillCount).toBe(0);
    expect(state.enemyHp - next.enemyHp).toBe(218);
  });
  it("crystal includes applied same-cast formula restoration before reserving its bonus", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player = { ...attacker("crystal_focus"), mp: 10000, maxMp: 10000, magicAtk: 100 };
    const skills: V2SkillId[] = ["v2c_mage_fireball", "v2c_primordialsage_completeformula", "v2c_primordialsage_optimization"];
    let state = initialBattleState(player, ENEMY, "용사", { learned: skills, equipped: skills });
    state = { ...state, stacks: { ...state.stacks, tier7: { formula: { stages: 2, seenSkillIds: ["v2c_elementallord_surge"] } } },
      unexploredSetRuntime: { ...state.unexploredSetRuntime!, paidDirectSkillCount: 2 } };
    const next = cast(state, player).state;
    expect(next.playerMp).toBe(10000); // Formula caps restoration at this cycle's actual spent MP.
    expect(next.unexploredSetRuntime?.paidDirectSkillCount).toBe(2);
    const plain = cast({ ...state, unexploredSetRuntime: undefined }, { ...player, unexploredSetEffects: [] }).state;
    expect(damageLines(next)).toEqual(damageLines(plain));
  });
  it("later turn-end mana regeneration cannot undo a paid crystal cast", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player = { ...attacker("crystal_focus"), mpRegenPerTurn: 1000 };
    const result = resolveBattleAtb(player, ENEMY, "용사", { pickAction: () => ({ kind: "attack" }), potions: {}, maxTurns: 1, forceAtbSkills: true,
      v2Skills: { learned: ["v2c_martial_combo"], equipped: ["v2c_martial_combo"] } });
    expect(result.finalState.playerMp).toBe(1000);
    expect(result.finalState.unexploredSetRuntime?.paidDirectSkillCount).toBe(1);
  });
  it("strengthens every fourth selected basic without creating extra attacks; keeps ordinary evasion reduction", () => {
    const player = attacker("precision_shot");
    let state = initialBattleState(player, { ...ENEMY, evasionPct: 100 }, "용사");
    for (const count of [1, 2, 3, 0]) {
      const next = attack({ ...state, phase: "player" }, player);
      expect(next.unexploredSetRuntime?.manualBasicAttackCount).toBe(count);
      // Equal 100 ratings reduce 25%: floor(75 * 1.5) on the fourth attempt.
      expect(state.enemyHp - next.enemyHp).toBe(count === 0 ? 112 : 75);
      expect(next.log.filter(e => e.kind === "player_attack")).toHaveLength(state.log.filter(e => e.kind === "player_attack").length + 1);
      state = next;
    }
  });
  it("separates static manual-basic and generated-basic bonuses", () => {
    const player = { ...attacker("precision_shot", "battle_revenge"), basicAttackDamagePct: 15, extraBasicAttackDamagePct: 20 };
    const initial = ready({ ...initialBattleState(player, ENEMY, "용사"), playerAttacksLeft: 2 });
    const first = attack(initial, player);
    const second = attack(first, player);
    expect(initial.enemyHp - first.enemyHp).toBe(138);
    expect(first.enemyHp - second.enemyHp).toBe(120);
    expect(second.unexploredSetRuntime?.manualBasicAttackCount).toBe(1);
  });
  it.each([[0.249, 72], [0.25, 0]])("rolls chain exactly once for all skill hits at roll %s", (roll, extra) => {
    // One skill-proc roll, then one chain roll. Further rolls cannot produce another chain.
    const random = vi.spyOn(Math, "random").mockReturnValueOnce(0).mockReturnValueOnce(roll).mockReturnValue(0);
    const player = { ...attacker("chain_drive"), extraBasicAttackDamagePct: 20 };
    const initial = skillState(player);
    const next = cast(initial, player).state;
    expect(initial.enemyHp - next.enemyHp).toBe(130 + extra);
    expect(damageLines(next)).toHaveLength(extra ? 6 : 5);
    expect(next.unexploredSetRuntime?.chainDriveResolving).toBe(false);
    expect(next.turn.completedPlayerTurns).toBe(0);
    expect(random).toHaveBeenCalledTimes(2);
  });
  it("chain basic can crit and apply ordinary on-hit statuses, but cannot spend revenge or precision", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player: PlayerCombat = { ...attacker("chain_drive", "battle_revenge", "precision_shot", "frost_mark"), critChancePct: 75, critMult: 2, extraBasicAttackDamagePct: 20,
      equipSignatures: [{ trigger: "on_hit", label: "중독", poisonChancePct: 100, poisonStacks: 1 }] };
    const initial = skillState(player);
    const next = cast(initial, player).state;
    expect(damageLines(next).at(-1)).toBe(144);
    expect(next.unexploredSetRuntime?.manualBasicAttackCount).toBe(0);
    expect(next.enemyV2Dots.some(d => d.tag === "poison")).toBe(true);
    expect(next.log.filter(e => e.text.includes("[서리 표식]"))).toHaveLength(1);
  });
  it.each([false, true])("frost refreshes without touching chill and lasts two enemy actions (lock=%s)", lock => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player = { ...attacker("frost_mark", ...(lock ? ["freezing_lock" as const] : [])), critChancePct: 75, evasionPct: 100 };
    let state = initialBattleState(player, { ...ENEMY, accuracy: 100 }, "용사");
    state = { ...state, stacks: { ...state.stacks, enemyFrostChillStacks: 3 } };
    const baseline = playerPveEvasionReductionPct(state, player);
    state = attack(state, player);
    expect(state.unexploredSetRuntime?.frost).toEqual({ speedReductionPct: lock ? 20 : 12, accuracyPenalty: lock ? 12 : 0, actions: 2 });
    // 85 * 100 / (100 + 88 * 2.5) = 26.5625%.
    expect(playerPveEvasionReductionPct(state, player)).toBe(lock ? 26.5625 : baseline);
    state = hit({ ...state, phase: "enemy", turn: { ...state.turn, enemyAttacksLeft: 2 } }, player);
    expect(state.unexploredSetRuntime?.frost?.actions).toBe(2);
    state = hit(state, player, false);
    expect(state.unexploredSetRuntime?.frost?.actions).toBe(1);
    state = attack({ ...state, phase: "player" }, player);
    expect(state.unexploredSetRuntime?.frost?.actions).toBe(2);
    expect(state.stacks.enemyFrostChillStacks).toBe(3);
    state = hit({ ...state, phase: "enemy", turn: { ...state.turn, enemyAttacksLeft: 1 } }, player);
    state = hit({ ...state, phase: "enemy", turn: { ...state.turn, enemyAttacksLeft: 1 } }, player);
    expect(state.unexploredSetRuntime?.frost?.actions ?? 0).toBe(0);
    expect(playerPveEvasionReductionPct(state, player)).toBe(baseline);
  });
  it.each([false, true])("colossus ignores only the corresponding defense of a direct skill (magic=%s)", magic => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player = { ...attacker("colossus_crush"), atk: 1000, magicAtk: 1000, intStat: 1000 };
    const skill = magic ? "v2c_frostmage_glacier" : "v2c_martial_combo";
    const enemy = { ...ENEMY, def: 100, magicDef: 200 };
    const actual = cast(skillState(player, skill, enemy), player).state;
    const plain = { ...player, unexploredSetEffects: [] };
    const expected = cast(skillState(plain, skill, { ...enemy, def: magic ? 100 : 90, magicDef: magic ? 180 : 200 }), plain).state;
    expect(damageLines(actual)).toEqual(damageLines(expected));
    expect(actual.enemyHp).toBe(expected.enemyHp);
  });
  it.each([["ATB", resolveBattleAtb], ["classic", resolveBattle]] as const)("keeps skill-generated basics extra and colony finalization once (%s)", (_name, resolve) => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player: PlayerCombat = { ...attacker("precision_shot", "colony_regeneration"), hp: 500, guaranteedEvades: 10, basicAttackDamagePct: 15, extraBasicAttackDamagePct: 20,
      equipSignatures: [{ trigger: "every_n_hits", label: "추가타", everyNHits: 5 }] };
    const result = resolve(player, ENEMY, "용사", { pickAction: () => ({ kind: "attack" }), potions: {}, v2Skills: { learned: ["v2c_martial_combo"], equipped: ["v2c_martial_combo"] }, maxTurns: 1, forceAtbSkills: true });
    expect(damageLines(result.finalState)).toEqual([26, 26, 26, 26, 26, 120]);
    expect(result.finalState.unexploredSetRuntime?.manualBasicAttackCount).toBe(0);
    expect(result.finalState.playerHp).toBe(520);
  });
  it.each(["basic", "skill", "shock"] as const)("slows exactly two enemy actions including the first waiting action (%s)", mode => {
    // The empty player skill attempt still rolls once before the first basic crit roll.
    vi.spyOn(Math, "random").mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValue(0.99);
    const player: PlayerCombat = { ...attacker("frost_mark", "freezing_lock"), hp: 100000, maxHp: 100000, spd: 1, critChancePct: 75,
      ...(mode === "shock" ? { equipSignatures: [{ trigger: "on_hit" as const, label: "감전", shockChancePct: 100 }] } : {}) };
    const enemy: Monster = { ...ENEMY, spd: 100, directActionSpd: true,
      ...(mode === "skill" ? { v2MaxMp: 10000, v2Skills: { learned: ["v2c_martial_combo"], equipped: ["v2c_martial_combo"] } } : {}) };
    const result = resolveBattleAtb(player, enemy, "용사", { pickAction: () => ({ kind: "attack" }), potions: {}, maxTurns: 2, forceAtbSkills: true });
    const enemyActions = result.finalState.log.filter(e => e.turn === "enemy" && (e.kind === "enemy_attack" || e.text.includes("움직이지 못했다")));
    const times = [...new Set(enemyActions.map(e => e.t))];
    // SPD 100 -> 80: ceil(100 / sqrt(.8)) = 112; expiry restores 100 ticks.
    expect(times.slice(0, 3)).toEqual([112, 224, 324]);
    expect(result.finalState.unexploredSetRuntime?.frost?.actions).toBe(0);
  });
  it("enemy skill plus skip-basic transition consumes one frost action", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player = { ...attacker("frost_mark", "freezing_lock"), critChancePct: 75 };
    const marked = attack(initialBattleState(player, ENEMY, "용사"), player);
    const skill = applyEnemyV2SkillCast({ ...marked, phase: "enemy", enemyMp: 1000, enemyMaxMp: 1000,
      enemyV2Skills: { learned: ["v2c_martial_combo"], equipped: ["v2c_martial_combo"] } }, player);
    expect(skill.castFired).toBe(true);
    expect(skill.state.unexploredSetRuntime?.frost?.actions).toBe(2);
    const next = resolveEnemyPhase(skill.state, player, "용사", true, true);
    expect(next.unexploredSetRuntime?.frost?.actions).toBe(1);
  });
  it.each([[1, 2, 151.2, 135], [100, 3, 190.4, 170]])("frost scales queued progress once before tectonic delay (SPD %i)", (spd, maxTurns, firstEnemyTick, plainEnemyTick) => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player = { ...attacker("frost_mark", "freezing_lock"), spd, magicAtk: 100, critChancePct: 75 };
    const enemy: Monster = { ...ENEMY, spd: 100, directActionSpd: true };
    const result = resolveBattleAtb(player, enemy, "용사", { pickAction: () => ({ kind: "attack" }), potions: {}, maxTurns, forceAtbSkills: true,
      v2Skills: { learned: ["v2c_earthmage_tectonic"], equipped: ["v2c_earthmage_tectonic"] } });
    // Existing progress: ceil(100 * 112/100)=112. New delay: 112*.35=39.2.
    // A crit refresh at t=100 adds another 39.2 without scaling progress again.
    expect(result.finalState.log.find(e => e.kind === "enemy_attack")?.t).toBeCloseTo(firstEnemyTick, 6);
    const marksBeforeEnemy = result.finalState.log.filter(e => e.text.startsWith("[서리 표식]") && (e.t ?? 0) < firstEnemyTick);
    expect(marksBeforeEnemy).toHaveLength(spd === 1 ? 1 : 2);
    const plain = resolveBattleAtb({ ...player, unexploredSetEffects: [] }, enemy, "용사", { pickAction: () => ({ kind: "attack" }), potions: {}, maxTurns, forceAtbSkills: true,
      v2Skills: { learned: ["v2c_earthmage_tectonic"], equipped: ["v2c_earthmage_tectonic"] } });
    expect(plain.finalState.log.find(e => e.kind === "enemy_attack")?.t).toBe(plainEnemyTick);
  });
  it("does not boost independent freezing damage or let it add another frost mark", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player = { ...attacker("battle_revenge", "crystal_focus", "frost_mark", "colossus_crush"), magicAtk: 1000, intStat: 1000, critChancePct: 75 };
    let state = ready(skillState(player, "v2c_frostmage_glacier", { ...ENEMY, def: 100, magicDef: 200 }));
    state = { ...state, stacks: { ...state.stacks, enemyFrostChillStacks: 4 }, unexploredSetRuntime: { ...state.unexploredSetRuntime!, paidDirectSkillCount: 2 } };
    const actual = cast(state, player).state;
    const plain = { ...player, unexploredSetEffects: [] };
    const expected = cast({ ...state, unexploredSetRuntime: undefined }, plain).state;
    expect(actual.log.filter(e => e.text.startsWith("빙결!"))).toEqual(expected.log.filter(e => e.text.startsWith("빙결!")));
    expect(actual.log.filter(e => e.text.startsWith("[서리 표식]"))).toHaveLength(1);
  });
  it.each([false, true])("colossus manual basic uses matching defense and excludes extras/counters (magic=%s)", magic => {
    const player = { ...attacker("colossus_crush"), atk: 1000, magicAtk: 1000, passiveMagicBasicAttack: magic, counterAtkBonus: 10 };
    const state = initialBattleState(player, { ...ENEMY, def: 100, magicDef: 200 }, "용사");
    // Legacy magical basics use physical DEF; the set penetrates that existing path.
    const boosted = attack(state, player);
    const plain = attack(state, { ...player, unexploredSetEffects: [] });
    expect(state.enemyHp - boosted.enemyHp).toBe(910);
    expect(boosted.enemyHp).toBeLessThanOrEqual(plain.enemyHp);
    expect(state.enemyHp - attack({ ...state, turn: { ...state.turn, firstAttackPending: false } }, player).enemyHp).toBe(900);
    expect(state.enemyHp - applyCounterIfAny(state, player).state.enemyHp).toBe(910);
  });
  it("chain guard excludes reentry and an extra basic preserves pending revenge", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player = attacker("chain_drive", "battle_revenge", "precision_shot");
    const initial = ready(skillState(player));
    const extra = resolvePlayerPhase(initial, player, "용사", { kind: "attack" }, { kind: "extra_basic", embedded: true, damageMult: 0.6 });
    expect(initial.enemyHp - extra.enemyHp).toBe(60);
    expect(extra.unexploredSetRuntime?.revengePending).toBe(true);
    expect(extra.unexploredSetRuntime?.manualBasicAttackCount).toBe(0);
    const guarded = cast({ ...initial, unexploredSetRuntime: { ...initial.unexploredSetRuntime!, chainDriveResolving: true } }, player).state;
    expect(damageLines(guarded)).toHaveLength(5);
  });
  it("chain keeps already queued signature basics intact and counts its own on-hit trigger", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player: PlayerCombat = { ...attacker("chain_drive"), equipSignatures: [{ trigger: "every_n_hits", label: "추가타", everyNHits: 5 }] };
    const result = cast(skillState(player), player);
    expect(result.signatureExtraActions).toBe(1);
    expect(result.state.stacks.signatureBonusAttacksLeft).toBe(1);
    expect(result.state.stacks.signatureHitCount).toBe(6);
  });
  it("logs ordinary skill evasion before the final revenge multiplier", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player = attacker("battle_revenge");
    const state = ready(skillState(player, "v2c_martial_combo", { ...ENEMY, evasionPct: 100 }));
    const result = cast(state, player).state;
    // Skill accuracy gives 24.3% reduction: each 26 becomes 19, preventing 7*5=35.
    expect(damageLines(result)).toEqual([22, 22, 22, 22, 22]);
    expect(result.log.filter(e => e.text.includes("회피 경감")).map(e => e.text)).toEqual([expect.stringMatching(/피해 -35$/)]);
  });
  it.each([[100, 1000, 2, 130], [99, 999, 0, 160]])("crystal requires positive net spend after immediate refunds (%i%%)", (refund, mp, count, damage) => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player: PlayerCombat = { ...attacker("crystal_focus"), equipSignatures: [{ trigger: "on_skill_cast", label: "환급", mpRefundPctOfCost: refund }] };
    let state = skillState(player);
    state = { ...state, unexploredSetRuntime: { ...state.unexploredSetRuntime!, paidDirectSkillCount: 2 } };
    const next = cast(state, player).state;
    expect(next.playerMp).toBe(mp);
    expect(next.unexploredSetRuntime?.paidDirectSkillCount).toBe(count);
    expect(state.enemyHp - next.enemyHp).toBe(damage);
  });
  it("does not count paid charge preparation or its subsequent free damage release for crystal", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player = { ...attacker("crystal_focus", "battle_revenge"), hp: 500, strStat: 200 };
    let state = ready(skillState(player, "v2c_ruinblade_ruinsword"));
    state = { ...state, stacks: { ...state.stacks, tier7: { swordIntent: 3 } }, unexploredSetRuntime: { ...state.unexploredSetRuntime!, paidDirectSkillCount: 2 } };
    const charge = cast(state, player);
    expect(charge.castFired).toBe(true);
    expect(charge.state.enemyHp).toBe(ENEMY.hp);
    expect(charge.state.playerMp).toBeLessThan(state.playerMp);
    expect(charge.state.unexploredSetRuntime?.revengePending).toBe(true);
    expect(charge.state.unexploredSetRuntime?.paidDirectSkillCount).toBe(2);
    const release = cast(charge.state, player);
    expect(release.state.enemyHp).toBeLessThan(ENEMY.hp);
    expect(release.state.playerMp).toBe(charge.state.playerMp);
    expect(release.state.unexploredSetRuntime?.paidDirectSkillCount).toBe(2);
    expect(release.state.unexploredSetRuntime?.revengePending).toBe(false);
  });
  it.each([["ATB", resolveBattleAtb], ["classic", resolveBattle]] as const)("basics remaining after a potion were not manually selected (%s)", (_name, resolve) => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player = { ...attacker("precision_shot"), hp: 500, attackCount: 2, basicAttackDamagePct: 15, extraBasicAttackDamagePct: 20 };
    const result = resolve(player, ENEMY, "용사", { pickAction: () => ({ kind: "use_potion", potionId: "potion_heal_s", potion: POTIONS.potion_heal_s }), potions: { potion_heal_s: 1 }, maxTurns: _name === "classic" ? 2 : 1, forceAtbSkills: true });
    expect(damageLines(result.finalState)).toEqual([120]);
    expect(result.finalState.unexploredSetRuntime?.manualBasicAttackCount).toBe(0);
  });
  it.each([["ATB", resolveBattleAtb], ["classic", resolveBattle]] as const)("completes a lethal chain once with one colony heal (%s)", (_name, resolve) => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player = { ...attacker("chain_drive", "colony_regeneration"), hp: 500, extraBasicAttackDamagePct: 20 };
    const result = resolve(player, { ...ENEMY, hp: 180 }, "용사", { pickAction: () => ({ kind: "attack" }), potions: {}, v2Skills: { learned: ["v2c_martial_combo"], equipped: ["v2c_martial_combo"] }, maxTurns: 1, forceAtbSkills: true });
    expect(result.finalState.outcome).toBe("win");
    expect(result.finalState.playerHp).toBe(520);
    expect(damageLines(result.finalState)).toHaveLength(6);
    expect(result.finalState.log.filter(e => e.text.includes("[군체 재생]"))).toHaveLength(1);
    expect(result.finalState.log.filter(e => e.text.includes("쓰러뜨렸다"))).toHaveLength(1);
  });
});

describe("unexplored defensive resolver boundaries", () => {
  it("floors gains, caps dedicated pools, and preserves exact thresholds", () => {
    expect(ironWallDefGain({ hpDamage: 200, currentBonus: 99, battleStartDef: 100 })).toBe(100);
    expect(ironWallDefGain({ hpDamage: 0, currentBonus: 40, battleStartDef: 100 })).toBe(40);
    expect(manaRedeployment({ currentSkillCount: 2, isSkill: true, currentShield: 50, maxHp: 1000 })).toEqual({ skillCount: 0, shield: 80 });
    expect(manaRedeployment({ currentSkillCount: 2, isSkill: true, currentShield: 100, maxHp: 1000 })).toEqual({ skillCount: 0, shield: 100 });
    expect(colonyRegeneration({ hp: 500, maxHp: 1000, receivedHealMult: 1 })).toBe(20);
    expect(colonyRegeneration({ hp: 350, maxHp: 1000, receivedHealMult: 0 })).toBe(0);
    expect(shouldQueueRevenge(49, 1000)).toBe(false);
    expect(shouldQueueRevenge(50, 1000)).toBe(true);
    expect(afterimageShield({ evasionPreventedDamage: 100, currentShield: 20, maxHp: 1000 })).toBe(30);
    expect(unyieldingDamage({ damage: 100, hpBefore: 350, maxHp: 1000, eligibleKind: true })).toBe(85);
    expect(unyieldingDamage({ damage: 100, hpBefore: 351, maxHp: 1000, eligibleKind: true })).toBe(100);
  });
});

describe("PvE unexplored defensive integration", () => {
  it("adds mana start shield to existing shields and initializes independent battle counters", () => {
    const player = { ...playerWith("mana_redeployment"), bulwarkShield: 25 };
    const state = initialBattleState(player, ENEMY, "용사");
    expect(state.stacks.playerShield).toBe(105);
    expect(state.unexploredSetRuntime?.manaSkillCount).toBe(0);
    expect(initialBattleState(player, ENEMY, "용사").unexploredSetRuntime).not.toBe(state.unexploredSetRuntime);
  });
  it.each([0, 100])("refreshes once per third successful paid/free skill (cost reduction %i)", reduction => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player = { ...playerWith("mana_redeployment"), mpCostReductionPct: reduction };
    let state = initialBattleState(player, ENEMY, "용사", { learned: ["v2c_golem_rocksmash"], equipped: ["v2c_golem_rocksmash"] });
    state = { ...state, stacks: { ...state.stacks, playerShield: 0 } };
    for (let i = 1; i <= 3; i++) {
      const result = cast(state, player);
      expect(result.castFired).toBe(true);
      state = result.state;
      expect(state.stacks.playerShield).toBe(i === 3 ? 80 : 0);
      expect(state.unexploredSetRuntime?.manaSkillCount).toBe(i % 3);
    }
    // Runtime tier normalization makes this skill cost 60 MP.
    expect(state.playerMp).toBe(reduction === 100 ? 1000 : 820);
  });
  it("does not count failed skill casts or basic actions", () => {
    const player = playerWith("mana_redeployment");
    const state = initialBattleState(player, ENEMY, "용사", { learned: ["v2c_golem_rocksmash"], equipped: ["v2c_golem_rocksmash"] });
    const failed = cast({ ...state, playerMp: 0 }, player);
    expect(failed.castFired).toBe(false);
    expect(finishPlayerTurn(failed.state, player, "용사").unexploredSetRuntime?.manaSkillCount).toBe(0);
  });
  it.each([[500, 1, 520], [400, 1, 430], [350, 0.5, 365], [350, 0, 350], [0, 1, 0]])("regenerates at action end from HP %i with received multiplier %s", (hp, receivedHealMult, expected) => {
    const player = { ...playerWith("colony_regeneration"), hp, receivedHealMult, healMult: 4 };
    expect(finishPlayerTurn(initialBattleState(player, ENEMY, "용사"), player, "용사").playerHp).toBe(expected);
  });
  it("gains iron wall DEF from direct actual HP loss, never shield-only damage", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const player = { ...playerWith("iron_wall", "battle_revenge"), def: 100, hp: 10000, maxHp: 10000 };
    const state = enemyState(player, 1000);
    const next = hit(state, player);
    // 858 HP damage against DEF 100 => floor(858 * .0075) = 6.
    expect(next.playerHp).toBe(9142);
    expect(next.unexploredSetRuntime?.ironWallDefBonus).toBe(6);
    const second = hit({ ...next, phase: "enemy", turn: { ...next.turn, enemyAttacksLeft: 1 } }, player);
    expect(second.playerHp).toBe(8291); // DEF 106 => 851 damage.
    const shielded = hit({ ...state, stacks: { ...state.stacks, playerShield: 2000 } }, player);
    expect(shielded.unexploredSetRuntime?.ironWallDefBonus).toBe(0);
    expect(shielded.unexploredSetRuntime?.revengePending).toBe(false);
  });
  it("aggregates revenge over a whole enemy action and resets its damage accumulator", () => {
    const player = playerWith("battle_revenge");
    const first = hit(enemyState(player, 30, 2), player);
    expect(first.unexploredSetRuntime?.revengePending).toBe(false);
    const second = hit(first, player, false);
    expect(second.unexploredSetRuntime?.revengePending).toBe(true);
    expect(second.unexploredSetRuntime?.enemyActionHpDamage).toBe(0);
    const below = hit(enemyState(player, 49), player);
    expect(below.unexploredSetRuntime?.revengePending).toBe(false);
  });
  it("creates afterimage only after the entire action, flooring the summed evasion reduction", () => {
    const player = { ...playerWith("afterimage_coating"), finalEvasionReductionPctAdd: 50 };
    const first = hit(enemyState(player, 10, 2), player);
    expect(first.stacks.playerShield).toBe(0);
    const second = hit(first, player, false);
    expect(second.playerHp).toBe(990);
    expect(second.stacks.playerShield).toBe(1); // floor((5 + 5) * .15)
    expect(second.unexploredSetRuntime?.afterimageShield).toBe(1);
  });
  it("caps the dedicated afterimage pool while preserving unrelated shielding", () => {
    const player = { ...playerWith("afterimage_coating"), finalEvasionReductionPctAdd: 50 };
    const state = enemyState(player, 400);
    const first = hit({ ...state, stacks: { ...state.stacks, playerShield: 1000 } }, player);
    expect(first.stacks.playerShield).toBe(830);
    expect(first.unexploredSetRuntime?.afterimageShield).toBe(30);
    const second = hit({ ...first, phase: "enemy", turn: { ...first.turn, enemyAttacksLeft: 1 } }, player);
    expect(second.stacks.playerShield).toBe(630);
    expect(second.unexploredSetRuntime?.afterimageShield).toBe(30);
  });
  it("full evasion generates no afterimage and no hit-triggered effects", () => {
    const player = { ...playerWith("afterimage_coating", "battle_revenge", "iron_wall"), guaranteedEvades: 1, finalEvasionReductionPctAdd: 50 };
    const next = hit(enemyState(player, 400), player);
    expect(next.playerHp).toBe(1000);
    expect(next.stacks.playerShield).toBe(0);
    expect(next.unexploredSetRuntime?.revengePending).toBe(false);
  });
  it("rechecks unyielding before each hit crossing 35% and multiplies before other reductions", () => {
    const player = { ...playerWith("unyielding_dead"), hp: 400, passiveDamageTakenReductionPct: 20 };
    const first = hit(enemyState(player, 100, 2), player);
    expect(first.playerHp).toBe(320);
    expect(hit(first, player, false).playerHp).toBe(252); // floor(floor(100 * .85) * .8)
  });
  it("applies unyielding to periodic status damage without iron wall/revenge/afterimage", () => {
    const player = { ...playerWith("unyielding_dead", "iron_wall", "battle_revenge", "afterimage_coating"), hp: 350, statusDamageReductionPct: 20 };
    const initial = enemyState(player);
    const next = tickPlayerDotsOnAction({ ...initial, playerV2Dots: [dot(100)] }, player, "용사");
    expect(next.playerHp).toBe(282);
    expect(next.unexploredSetRuntime?.ironWallDefBonus).toBe(0);
    expect(next.unexploredSetRuntime?.revengePending).toBe(false);
    expect(next.stacks.playerShield).toBe(0);
  });
  it("also detects enemy skill actual HP damage", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player = playerWith("battle_revenge", "afterimage_coating");
    const state = enemyState(player);
    const next = applyEnemyV2SkillCast({ ...state, enemyMp: 1000, enemyMaxMp: 1000, enemyV2Skills: { learned: ["v2c_golem_rocksmash"], equipped: ["v2c_golem_rocksmash"] } }, player);
    expect(next.castFired).toBe(true);
    expect(next.state.playerHp).toBeLessThanOrEqual(950);
    expect(next.state.unexploredSetRuntime?.revengePending).toBe(true);
  });
  it("records lethal direct HP loss before survival handling, excluding overkill", () => {
    const player = { ...playerWith("iron_wall", "battle_revenge"), hp: 200, def: 100 };
    const next = hit(enemyState(player, 10000), player);
    expect(next.playerHp).toBe(0);
    expect(next.unexploredSetRuntime?.ironWallDefBonus).toBe(1);
    expect(next.unexploredSetRuntime?.revengePending).toBe(true);
  });
  it("rechecks unyielding between periodic status ticks crossing the threshold", () => {
    const player = { ...playerWith("unyielding_dead"), hp: 400 };
    const state = enemyState(player);
    expect(tickPlayerDotsOnAction({ ...state, playerV2Dots: [dot(100), dot(100)] }, player, "용사").playerHp).toBe(215);
  });
  it("caps iron wall against original DEF even after defense changes", () => {
    const player = { ...playerWith("iron_wall"), def: 10, hp: 100000, maxHp: 100000 };
    let state = enemyState(player, 10000);
    state = hit(state, player);
    expect(state.unexploredSetRuntime?.ironWallDefBonus).toBe(10);
    state = hit({ ...state, phase: "enemy" }, { ...player, def: 100 });
    expect(state.unexploredSetRuntime?.ironWallDefBonus).toBe(10);
  });
  it("rechecks unyielding for each enemy skill hit while keeping no-set skill logs unchanged", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const run = (player: PlayerCombat) => {
      const state = enemyState(player);
      return applyEnemyV2SkillCast({ ...state, enemyMp: 1000, enemyMaxMp: 1000, enemyV2Skills: { learned: ["v2c_martial_combo"], equipped: ["v2c_martial_combo"] } }, player).state;
    };
    // Five raw 26-damage hits: 400 -> 374 -> 348 -> 326 -> 304 -> 282.
    expect(run({ ...playerWith("unyielding_dead"), hp: 400 }).playerHp).toBe(282);
    const plain = run({ ...PLAYER, hp: 400, passiveDamageTakenReductionPct: 20 });
    expect(plain.playerHp).toBe(296); // collapsed floor(130*.8), not five floor(26*.8).
    expect(run({ ...PLAYER, hp: 400, passiveDamageTakenReductionPct: 20, unexploredSetEffects: [] })).toEqual(plain);
    expect(plain.log.filter(entry => entry.kind === "enemy_attack").map(entry => entry.text)).toEqual(["연환 난타! 104 피해를 입혔다."]);
  });
  it("regenerates after a successful lethal basic action", () => {
    const player = { ...playerWith("colony_regeneration"), hp: 500, atk: 100000 };
    const initial = initialBattleState(player, ENEMY, "용사");
    const next = resolvePlayerPhase({ ...initial, enemyHp: 1 }, player, "용사", { kind: "attack" });
    expect(next.outcome).toBe("win");
    expect(next.playerHp).toBe(520);
  });
  it("regenerates after a successful lethal skill action", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player = { ...playerWith("colony_regeneration"), hp: 500 };
    const initial = initialBattleState(player, ENEMY, "용사", { learned: ["v2c_golem_rocksmash"], equipped: ["v2c_golem_rocksmash"] });
    const next = cast({ ...initial, enemyHp: 1 }, player);
    expect(next.castFired).toBe(true);
    expect(next.state.enemyHp).toBe(0);
    expect(next.state.playerHp).toBe(520);
  });
  it("honors burn healing reduction while ignoring positive received-heal bonuses", () => {
    const player = { ...playerWith("colony_regeneration"), hp: 350, receivedHealMult: 5 };
    const state = initialBattleState(player, ENEMY, "용사");
    expect(finishPlayerTurn({ ...state, playerV2Dots: [{ ...dot(1), tag: "burn", label: "연소" }] }, player, "용사").playerHp).toBe(365);
  });
  it("preserves magic durability partition and reduces body damage exactly once before ordinary shield", () => {
    const player = { ...playerWith("unyielding_dead"), hp: 350, passiveDamageTakenReductionPct: 20,
      magicBarrierMax: 100, magicBarrierAbsorbPct: 25, magicBarrierEfficiencyPct: 20, bulwarkShield: 10 };
    const next = hit(enemyState(player), player);
    // 100 -> 25 mana / 75 body -> floor(75*.85)=63 -> floor(63*.8)=50 -> shield 10 -> HP 40.
    expect(next.playerHp).toBe(310);
    expect(next.stacks.playerShield).toBe(0);
    expect(next.playerMagicBarrier).toBe(80);
  });
  it("floors iron wall separately for each enemy skill hit, then queues revenge once", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player = { ...playerWith("iron_wall", "battle_revenge"), def: 100, hp: 10000, maxHp: 10000 };
    const state = enemyState(player, 1000);
    const next = applyEnemyV2SkillCast({ ...state, enemyMp: 1000, enemyMaxMp: 1000, enemyV2Skills: { learned: ["v2c_martial_combo"], equipped: ["v2c_martial_combo"] } }, player).state;
    // Five 240 HP hits each gain floor(1.8) DEF, not floor(1200*.0075).
    expect(next.playerHp).toBe(8800);
    expect(next.unexploredSetRuntime?.ironWallDefBonus).toBe(5);
    expect(next.unexploredSetRuntime?.revengePending).toBe(true);
  });
  it("consumes the afterimage pool before allowing a new capped pool", () => {
    const player = { ...playerWith("afterimage_coating"), finalEvasionReductionPctAdd: 50 };
    const first = hit(enemyState(player, 400), player);
    const next = hit({ ...first, phase: "enemy", turn: { ...first.turn, enemyAttacksLeft: 1 } }, player);
    expect(next.playerHp).toBe(630); // 200, then (200 - old 30 shield).
    expect(next.stacks.playerShield).toBe(30);
    expect(next.unexploredSetRuntime?.afterimageShield).toBe(30);
  });
  it("excludes periodic monster chill from unyielding and direct-hit effects", () => {
    const player = { ...playerWith("unyielding_dead", "iron_wall", "battle_revenge", "afterimage_coating"), hp: 350 };
    const state = enemyState(player);
    const next = resolveEnemyPhase({ ...state,
      enemy: { ...ENEMY, skill: { kind: "chill", name: "한기", perHit: 1, dmgPerStack: 100, threshold: 1 } },
      stacks: { ...state.stacks, chillStacks: 1 },
    }, player, "용사", true, true);
    expect(next.playerHp).toBe(250);
    expect(next.unexploredSetRuntime?.revengePending).toBe(false);
    expect(next.unexploredSetRuntime?.ironWallDefBonus).toBe(0);
    expect(next.stacks.playerShield).toBe(0);
  });
  it("does not count the HP preserved by endurance toward a multi-hit revenge threshold", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player = { ...playerWith("battle_revenge"), hp: 50, enduranceActive: true };
    const state = enemyState(player);
    const next = applyEnemyV2SkillCast({ ...state, enemyMp: 1000, enemyMaxMp: 1000, enemyV2Skills: { learned: ["v2c_martial_combo"], equipped: ["v2c_martial_combo"] } }, player).state;
    expect(next.playerHp).toBe(1);
    expect(next.unexploredSetRuntime?.revengePending).toBe(false);
  });
  it("does not mistake a newly generated heal shield for unconsumed afterimage", () => {
    const player = { ...playerWith("afterimage_coating"), finalEvasionReductionPctAdd: 50 };
    const first = hit(enemyState(player, 400), player);
    const next = hit({ ...first, phase: "enemy", turn: { ...first.turn, enemyAttacksLeft: 1 } }, {
      ...player, bloodfeastPct: 100,
      equipSignatures: [{ trigger: "on_heal", label: "회복 보호막", healToShieldPct: 100 }],
    });
    expect(next.playerHp).toBe(800);
    expect(next.stacks.playerShield).toBe(200); // New heal shield 170 + new afterimage 30.
    expect(next.unexploredSetRuntime?.afterimageShield).toBe(30);
  });
  it("keeps a tracked shield break independent of the afterimage pool", () => {
    const player: PlayerCombat = { ...playerWith("afterimage_coating"), finalEvasionReductionPctAdd: 50,
      equipSignatures: [
        { trigger: "battle_start", label: "추적 방벽", battleStartShieldPctMaxHp: 10 },
        { trigger: "tracked_shield_break", label: "추적 방벽", trackedShieldPctMaxHp: 10, damageTakenReductionPct: 10, buffActions: 1 },
      ],
    };
    const first = hit(enemyState(player, 100), player);
    expect(first.stacks.playerShield).toBe(57);
    const next = hit({ ...first, phase: "enemy", turn: { ...first.turn, enemyAttacksLeft: 1 } }, player);
    expect(next.stacks.trackedSetShield).toBe(0);
    expect(next.flags.trackedShieldBreakUsed).toBe(true);
    expect(next.unexploredSetRuntime?.afterimageShield).toBe(14);
  });
  it.each([
    ["ATB", resolveBattleAtb, 100000],
    ["classic", resolveBattle, 100000],
    ["ATB lethal bonus", resolveBattleAtb, 200],
    ["classic lethal bonus", resolveBattle, 200],
  ] as const)("regenerates once after the skill and all generated basics (%s)", (_label, resolve, enemyHp) => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player: PlayerCombat = {
      ...playerWith("colony_regeneration"), hp: 500, atk: 100, guaranteedEvades: 10,
      equipSignatures: [{ trigger: "every_n_hits", label: "추가 공격", everyNHits: 5 }],
    };
    const next = resolve(player, { ...ENEMY, hp: enemyHp }, "용사", {
      pickAction: () => ({ kind: "attack" }), potions: {}, maxTurns: 1,
      forceAtbSkills: true,
      v2Skills: { learned: ["v2c_martial_combo"], equipped: ["v2c_martial_combo"] },
    }).finalState;
    const healing = next.log.filter(entry => entry.text.includes("[군체 재생]"));
    expect(next.playerHp).toBe(520);
    expect(healing).toHaveLength(1);
    const attacks = next.log.filter(entry => entry.kind === "player_attack");
    expect(attacks).toHaveLength(6); // Five skill hits, then the generated basic.
    expect(next.log.indexOf(healing[0]!)).toBeGreaterThan(next.log.indexOf(attacks[5]!));
    if (_label.startsWith("ATB")) expect(healing[0]?.t).toBe(0);
  });
  it.each([
    ["ATB", resolveBattleAtb],
    ["classic", resolveBattle],
  ] as const)("preserves terminal shadow-clone victory and heals once before discarding queued basics (%s)", (_label, resolve) => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player: PlayerCombat = {
      ...playerWith("colony_regeneration"), hp: 500, atk: 100, shadowCloneAtkPct: 100,
      equipSignatures: [{ trigger: "every_n_hits", label: "추가 공격", everyNHits: 5 }],
    };
    const run = (fighter: PlayerCombat) => resolve(fighter, { ...ENEMY, hp: 200 }, "용사", {
      pickAction: () => ({ kind: "attack" }), potions: {}, maxTurns: 1,
      forceAtbSkills: true,
      v2Skills: { learned: ["v2c_martial_combo"], equipped: ["v2c_martial_combo"] },
    }).finalState;
    const next = run(player);
    expect(next.playerHp).toBe(520);
    expect(next.phase).toBe("ended");
    expect(next.outcome).toBe("win");
    expect(next.enemyHp).toBe(0);
    const healing = next.log.filter(entry => entry.text.includes("[군체 재생]"));
    expect(healing).toHaveLength(1);
    const attacks = next.log.filter(entry => entry.kind === "player_attack");
    expect(attacks).toHaveLength(6); // Five skill hits and the lethal shadow clone, no generated basic.
    expect(attacks[5]?.text).toContain("그림자 분신");
    expect(next.log.indexOf(healing[0]!)).toBeGreaterThan(next.log.indexOf(attacks[5]!));
    expect(next.log.filter(entry => entry.text.includes("쓰러뜨렸다"))).toHaveLength(1);
    if (_label === "ATB") expect(healing[0]?.t).toBe(0);
    const plain = run({ ...player, unexploredSetEffects: undefined });
    expect(plain.playerHp).toBe(500);
    expect(plain.outcome).toBe("win");
    expect(plain.log.some(entry => entry.text.includes("[군체 재생]"))).toBe(false);
    expect(plain.log.filter(entry => entry.kind === "player_attack")).toEqual(attacks);
  });
  it("preserves standalone successful basic and potion colony completion", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player = { ...playerWith("colony_regeneration"), hp: 500, atk: 100 };
    const initial = initialBattleState(player, ENEMY, "용사");
    const basic = resolvePlayerPhase(initial, player, "용사", { kind: "attack" });
    expect(basic.playerHp).toBe(520);
    expect(basic.log.filter(entry => entry.text.includes("[군체 재생]"))).toHaveLength(1);
    const potion = resolvePlayerPhase(initial, player, "용사", {
      kind: "use_potion", potionId: "potion_heal_s", potion: POTIONS.potion_heal_s,
    });
    expect(potion.playerHp).toBe(715); // Potion +200, then floor((1000 - 700) * .05).
    expect(potion.log.filter(entry => entry.text.includes("[군체 재생]"))).toHaveLength(1);
  });
});
