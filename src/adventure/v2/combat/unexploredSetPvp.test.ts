import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/adventure/data/v2/coreLoopConfig", async original => ({
  ...await original<typeof import("@/adventure/data/v2/coreLoopConfig")>(),
  V2_CORE_LOOP_V2: false,
  V2_ATB_SKILLS: true,
}));
import { UNEXPLORED_SPECIALTY_TAG_SETS } from "@/adventure/data/v2/unexploredSpecialtyEquipment";
import type { V2SkillId } from "@/adventure/data/v2/v2Skills";
import type { PlayerCombat } from "./engine";
import {
  advanceTurnPvP, applyUnexploredFrostMarkPvP, castV2SkillOnAttackerTurnPvP,
  effectivePvPAccuracyRating, endAttackerPhase, initialBattleStatePvP,
  resolveBattlePvP, tickPvPSideDotsOnAction, tickUnexploredDebuffs,
  maybeApplyMartialCounter, applyOnHitReflect,
  type PvPBattleState,
} from "./engine-pvp";
import { effectiveSideSpd, resolveBattlePvPAtb } from "./engine.pvp-atb";

type Side = "p1" | "p2";
type EffectKind = NonNullable<PlayerCombat["unexploredSetEffects"]>[number]["kind"];
const effects = (...kinds: EffectKind[]) => UNEXPLORED_SPECIALTY_TAG_SETS.flatMap(set =>
  set.thresholds.flatMap(t => "effect" in t && kinds.includes(t.effect.kind) ? [t.effect] : []));
const fighter = (overrides: Partial<PlayerCombat> = {}): PlayerCombat => ({
  hp: 1000, maxHp: 1000, mp: 1000, maxMp: 1000, atk: 100, magicAtk: 100,
  def: 0, magicDef: 0, spd: 100, critChancePct: 0, critMult: 1.5,
  evasionPct: 0, accuracyPct: 100, attackCount: 1, ...overrides,
});
const other = (side: Side): Side => side === "p1" ? "p2" : "p1";
function battle(side: Side, player: PlayerCombat, opponent = fighter(), skills: V2SkillId[] = []): PvPBattleState {
  const equipped = { learned: skills, equipped: skills };
  return initialBattleStatePvP(
    side === "p1" ? player : opponent, side === "p2" ? player : opponent,
    "P1", "P2", side === "p1" ? equipped : undefined, side === "p2" ? equipped : undefined,
    undefined, undefined, side,
  );
}
const prepare = (state: PvPBattleState, actor: Side, hits = 1): PvPBattleState => ({
  ...state, phase: actor, [actor]: { ...state[actor], attacksLeft: hits, turn: { ...state[actor].turn, firstAttackPending: true } },
});
const basic = (state: PvPBattleState) => advanceTurnPvP(state, { kind: "attack" }, { tickDefenderDots: false });
const cast = (state: PvPBattleState, actor: Side) => castV2SkillOnAttackerTurnPvP(state, actor);
const withRuntime = (state: PvPBattleState, side: Side, fields: Partial<NonNullable<PvPBattleState[Side]["stacks"]["unexplored"]>>): PvPBattleState => ({
  ...state, [side]: { ...state[side], stacks: { ...state[side].stacks, unexplored: { ...state[side].stacks.unexplored!, ...fields } } },
});
const damageLines = (state: PvPBattleState) => state.log.filter(e => e.kind === "player_attack" && / (\d+) 피해/.test(e.text)).map(e => Number(e.text.match(/ (\d+) 피해/)?.[1]));
const dot = (tag: "bleed" | "poison" | "burn", damage: number) => ({ tag, label: tag, stacks: 1, maxStacks: 10, turns: 3, flatPerStack: damage, atkCoefPerStack: 0, pctMaxHpPerStack: 0, sourceAtk: 0 });
afterEach(() => vi.restoreAllMocks());

describe.each(["p1", "p2"] as const)("%s unexplored set symmetry", side => {
  const target = other(side);
  it("initializes only the owner and adds the starting mana shield with sustain scaling once", () => {
    const initial = battle(side, fighter({ def: 100, bulwarkShield: 20, unexploredSetEffects: effects("mana_redeployment") }));
    expect(initial[side].stacks.unexplored).toMatchObject({ revengePending: false, manaSkillCount: 0, battleStartDef: 100, ironWallDefBonus: 0 });
    expect(initial[target].stacks.unexplored).toBeUndefined();
    expect(initial[side].stacks.playerShield).toBe(100);
    const scaled = initialBattleStatePvP(initial.p1.player, initial.p2.player, "P1", "P2", undefined, undefined, 0.65, 0.65);
    expect(scaled[side].stacks.playerShield).toBe(65);
  });
  it("refreshes mana shield every third successful utility cast including free casts", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    let state = battle(side, fighter({ hp: 200, unexploredSetEffects: effects("mana_redeployment"), equipSignatures: [{ trigger: "on_skill_cast", label: "환급", mpRefundPctOfCost: 100 }] }), fighter(), ["v2c_warrior_warcry"]);
    state = { ...state, sustainMultiplier: 0.65, [side]: { ...state[side], stacks: { ...state[side].stacks, playerShield: 10 } } };
    for (const count of [1, 2, 0]) {
      const ready = { ...state, [side]: { ...state[side], v2SelfBuffs: {}, v2SkillCooldowns: {} } };
      const result = cast(prepare(ready, side), side);
      expect(result.castFired).toBe(true);
      state = result.state;
      expect(state[side].stacks.unexplored?.manaSkillCount).toBe(count);
    }
    expect(state[side].stacks.playerShield).toBe(52);
    expect(state[side].mp).toBe(1000);
    expect(state[target].stacks.playerShield).toBe(0);
  });
  it("queues revenge from one incoming multihit action and floors iron for each actual HP hit", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    let state = battle(target, fighter({ atk: 1000 }), fighter({ hp: 5000, maxHp: 5000, def: 100, unexploredSetEffects: effects("iron_wall", "battle_revenge") }), ["v2c_martial_combo"]);
    state = cast(state, target).state;
    expect(state[side].stacks.unexplored?.ironWallDefBonus).toBe(5); // Five 133+ HP hits, floored separately.
    state = endAttackerPhase(state, target, side, { tickDefenderDots: false });
    expect(state[side].stacks.unexplored?.revengePending).toBe(true);
    expect(state[target].stacks.unexplored).toBeUndefined();
  });
  it("uses accumulated iron for subsequent physical hits and caps it at battle-start DEF", () => {
    const state = withRuntime(battle(target, fighter({ atk: 400 }), fighter({ hp: 10000, maxHp: 10000, def: 100, unexploredSetEffects: effects("iron_wall") })), side, { ironWallDefBonus: 99 });
    const next = basic(state);
    expect(next[side].hp).toBe(9799);
    expect(next[side].stacks.unexplored?.ironWallDefBonus).toBe(100);
  });
  it("boosts every hit of a direct skill with one revenge snapshot and consumes it once", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const state = withRuntime(battle(side, fighter({ unexploredSetEffects: effects("battle_revenge") }), fighter(), ["v2c_martial_combo"]), side, { revengePending: true });
    const next = cast(state, side).state;
    expect(damageLines(next)).toEqual([31, 31, 31, 31, 31]);
    expect(next[side].stacks.unexplored?.revengePending).toBe(false);
    expect(next[target].hp).toBe(845);
  });
  it("counts the third paid cast once per multihit action and preserves PvP scaling once", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    let state = battle(side, fighter({ unexploredSetEffects: effects("crystal_focus") }), fighter(), ["v2c_martial_combo"]);
    for (const [count, damage] of [[1, 130], [2, 130], [0, 160]]) {
      const next = cast(prepare(state, side), side).state;
      expect(state[target].hp - next[target].hp).toBe(damage);
      expect(next[side].stacks.unexplored?.paidDirectSkillCount).toBe(count);
      state = next;
    }
    const scaled = cast({ ...withRuntime(prepare(state, side), side, { paidDirectSkillCount: 2 }), damageMultiplier: 0.65 }, side).state;
    expect(state[target].hp - scaled[target].hp).toBe(100); // floor(floor(26 * 1.25) * .65) * 5.
  });
  it("does not spend revenge on full evade but consumes the third paid attempt", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const state = withRuntime(battle(side, fighter({ unexploredSetEffects: effects("battle_revenge", "crystal_focus") }), fighter({ guaranteedEvades: 1 }), ["v2c_martial_combo"]), side, { revengePending: true, paidDirectSkillCount: 2 });
    const next = cast(state, side).state;
    expect(next[target].hp).toBe(1000);
    expect(next[side].stacks.unexplored).toMatchObject({ revengePending: true, paidDirectSkillCount: 0 });
  });
  it("does not consume crystal when native restoration pays back the entire direct cast", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const state = withRuntime(battle(side, fighter({ maxMp: 10000, unexploredSetEffects: effects("crystal_focus") }), fighter(), ["v2c_elementallord_surge", "v2c_elementallord_resonance"]), side, { paidDirectSkillCount: 2 });
    const next = cast(state, side).state;
    expect(next[side].mp).toBe(10000);
    expect(next[side].stacks.unexplored?.paidDirectSkillCount).toBe(2);
    expect(next[target].hp).toBe(825);
  });
  it("boosts only selected basics and counts fourth attempts even when fully evaded", () => {
    let state = battle(side, fighter({ basicAttackDamagePct: 15, extraBasicAttackDamagePct: 20, unexploredSetEffects: effects("precision_shot", "battle_revenge") }));
    for (const damage of [115, 115, 115, 172]) {
      const next = basic(prepare(state, side, 2));
      expect(state[target].hp - next[target].hp).toBe(damage);
      const extra = basic(next);
      expect(next[target].hp - extra[target].hp).toBe(120);
      state = extra;
    }
    const attempt = withRuntime(prepare(battle(side, state[side].player, fighter({ guaranteedEvades: 1 })), side), side, { manualBasicAttackCount: 3, revengePending: true });
    const evaded = basic(attempt);
    expect(evaded[side].stacks.unexplored).toMatchObject({ manualBasicAttackCount: 0, revengePending: true });
    expect(evaded[target].hp).toBe(1000);
  });
  it("resolves one chain through normal critical/status basics without consuming other resources", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const state = withRuntime(battle(side, fighter({ extraBasicAttackDamagePct: 20, unexploredSetEffects: effects("chain_drive", "precision_shot"), equipSignatures: [{ trigger: "on_hit", label: "중독", poisonChancePct: 100, poisonStacks: 1 }] }), fighter(), ["v2c_martial_combo"]), side, { manualBasicAttackCount: 3 });
    const next = cast(state, side).state;
    expect(damageLines(next)).toEqual([26, 26, 26, 26, 26, 72]);
    expect(next[target].hp).toBe(798);
    expect(next[side].stacks.unexplored).toMatchObject({ manualBasicAttackCount: 3, chainDriveResolving: false });
    expect(next[target].v2Dots.some(d => d.tag === "poison")).toBe(true);
  });
  it("adds afterimage once per enemy action from ordinary evasion, with sustain scaling once", () => {
    let state = battle(target, fighter({ atk: 600, attackCount: 2 }), fighter({ unexploredSetEffects: effects("afterimage_coating"), evasionPct: 100 }));
    state = { ...state, sustainMultiplier: 0.65 };
    const first = basic(state);
    expect(first[side].stacks.playerShield).toBe(0);
    const next = basic(first);
    expect(next[side].stacks.playerShield).toBe(19); // floor(min(30, 15% of action's evasion) * .65).
    expect(next[side].stacks.unexplored?.afterimageShield).toBe(19);
  });
  it("fully evaded damage cannot build iron, revenge or afterimage", () => {
    const state = battle(target, fighter({ atk: 1000 }), fighter({ guaranteedEvades: 1, def: 100, unexploredSetEffects: effects("iron_wall", "battle_revenge", "afterimage_coating") }));
    const next = basic(state);
    expect(next[side].hp).toBe(1000);
    expect(next[side].stacks.unexplored).toMatchObject({ ironWallDefBonus: 0, revengePending: false, afterimageShield: 0 });
  });
  it("applies unyielding after evasion, before reductions and shields", () => {
    const state = battle(target, fighter(), fighter({ hp: 350, bulwarkShield: 10, passiveDamageTakenReductionPct: 20, unexploredSetEffects: effects("unyielding_dead") }));
    const next = basic(state);
    expect(next[side].hp).toBe(292); // 100 * .85 * .8 - 10 = 58.
  });
  it("rechecks unyielding HP threshold between skill hits", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const state = battle(target, fighter(), fighter({ hp: 400, unexploredSetEffects: effects("unyielding_dead") }), ["v2c_martial_combo"]);
    const next = cast(state, target).state;
    expect(next[side].hp).toBe(282); // 26 + 26 + 22 + 22 + 22.
  });
  it("rechecks unyielding between poison, bleed and burn without building direct-hit resources", () => {
    let state = battle(side, fighter({ hp: 400, unexploredSetEffects: effects("unyielding_dead", "iron_wall", "battle_revenge", "afterimage_coating") }));
    state = { ...state, [side]: { ...state[side], v2Dots: [dot("poison", 100), dot("bleed", 100), dot("burn", 100)] } };
    const next = tickPvPSideDotsOnAction(state, side);
    expect(next[side].hp).toBe(130);
    expect(next[side].stacks.unexplored).toMatchObject({ ironWallDefBonus: 0, revengePending: false, afterimageShield: 0 });
  });
  it("heals colony once after all basics and honors reduction, burn and sustain", () => {
    const state = battle(side, fighter({ hp: 500, attackCount: 2, healMult: 3, receivedHealMult: 2, unexploredSetEffects: effects("colony_regeneration") }));
    const first = basic(state);
    expect(first[side].hp).toBe(500);
    const next = basic(first);
    expect(next[side].hp).toBe(520);
    const reduced = { ...state, sustainMultiplier: 0.65, [side]: { ...state[side], player: { ...state[side].player, receivedHealMult: 0.5 }, v2Dots: [dot("burn", 1)] } };
    expect(basic(basic(reduced))[side].hp).toBe(503);
  });
  it("applies one frost mark per critical action, independent of existing chill, for two target actions", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    let state = battle(side, fighter({ critChancePct: 100, unexploredSetEffects: effects("frost_mark", "freezing_lock") }), fighter(), ["v2c_martial_combo"]);
    state = { ...state, [target]: { ...state[target], stacks: { ...state[target].stacks, frostChillStacks: 3, accuracyDownTurns: 3, accuracyDownPct: 20 } } };
    let marked = cast(state, side).state;
    expect(marked[target].unexploredDebuffs).toEqual({ frostActions: 2, speedReductionPct: 20, accuracyPenalty: 12 });
    expect(marked[target].stacks.frostChillStacks).toBe(3);
    expect(effectiveSideSpd(marked, target)).toBe(80);
    expect(effectivePvPAccuracyRating(marked[target])).toBe(68);
    expect(marked.log.filter(e => e.text.includes("[서리 표식]"))).toHaveLength(1);
    marked = basic(prepare(marked, target, 2));
    expect(marked[target].unexploredDebuffs?.frostActions).toBe(2);
    marked = basic(marked);
    expect(marked[target].unexploredDebuffs?.frostActions).toBe(1);
    marked = basic(prepare(marked, target));
    expect(marked[target].unexploredDebuffs).toBeUndefined();
  });
  it("refreshes frost through the shared symmetric state transition", () => {
    const state = battle(side, fighter({ unexploredSetEffects: effects("frost_mark", "freezing_lock") }));
    const marked = applyUnexploredFrostMarkPvP(state, side, target);
    const ticked = tickUnexploredDebuffs(marked, target);
    expect(applyUnexploredFrostMarkPvP(ticked, side, target)[target].unexploredDebuffs?.frostActions).toBe(2);
    expect(tickUnexploredDebuffs(ticked, target)[target].unexploredDebuffs).toBeUndefined();
  });
  it.each([false, true])("penetrates the existing %s magical-basic defense path only for the manual body", magic => {
    const player = fighter({ atk: 1000, magicAtk: magic ? 2000 : 100, passiveMagicBasicAttack: magic, unexploredSetEffects: effects("colossus_crush") });
    const state = battle(side, player, fighter({ hp: 10000, maxHp: 10000, def: 100, magicDef: 1000 }));
    const next = basic(prepare(state, side, 2));
    expect(state[target].hp - next[target].hp).toBe(magic ? 1100 : 910);
    expect(next[target].hp - basic(next)[target].hp).toBe(magic ? 1000 : 900);
  });
  it("keeps both owners' counters and defensive runtimes independent", () => {
    const player = fighter({ unexploredSetEffects: effects("precision_shot", "battle_revenge") });
    const initial = battle(side, player, player);
    const next = basic(initial);
    expect(initial[side].stacks.unexplored?.manualBasicAttackCount).toBe(0);
    expect(next[side].stacks.unexplored).toMatchObject({ manualBasicAttackCount: 1, revengePending: false });
    expect(next[target].stacks.unexplored).toMatchObject({ manualBasicAttackCount: 0, revengePending: true });
    const reply = basic(next);
    expect(reply[target].stacks.unexplored).toMatchObject({ manualBasicAttackCount: 1, revengePending: false });
    expect(reply[side].stacks.unexplored).toMatchObject({ manualBasicAttackCount: 1, revengePending: true });
    expect(reply[side].hp).toBe(880);
  });
  it.each(["v2c_martial_combo", "v2c_frostmage_glacier"] as const)("penetrates the selected direct-skill defense for %s", skill => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player = fighter({ atk: 1000, magicAtk: 1000, intStat: 1000, unexploredSetEffects: effects("colossus_crush") });
    const opponent = fighter({ hp: 10000, maxHp: 10000, def: 100, magicDef: 200 });
    const actual = cast(battle(side, player, opponent, [skill]), side).state;
    const physical = skill === "v2c_martial_combo";
    const expected = cast(battle(side, { ...player, unexploredSetEffects: [] }, { ...opponent, def: physical ? 90 : 100, magicDef: physical ? 200 : 180 }, [skill]), side).state;
    expect(actual[target].hp).toBe(expected[target].hp);
    expect(damageLines(actual)).toEqual(damageLines(expected));
  });
  it.each([[100, 1000, 2, 130], [99, 999, 0, 160]])("crystal uses applied immediate refund %i%%", (refund, mp, count, damage) => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const state = withRuntime(battle(side, fighter({ unexploredSetEffects: effects("crystal_focus"), equipSignatures: [{ trigger: "on_skill_cast", label: "환급", mpRefundPctOfCost: refund }] }), fighter(), ["v2c_martial_combo"]), side, { paidDirectSkillCount: 2 });
    const next = cast(state, side).state;
    expect(next[side].mp).toBe(mp);
    expect(next[side].stacks.unexplored?.paidDirectSkillCount).toBe(count);
    expect(next[target].hp).toBe(1000 - damage);
  });
  it("crystal includes completing formula restoration before damage reservation", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    let state = withRuntime(battle(side, fighter({ maxMp: 10000, unexploredSetEffects: effects("crystal_focus") }), fighter(), ["v2c_mage_fireball", "v2c_primordialsage_completeformula", "v2c_primordialsage_optimization"]), side, { paidDirectSkillCount: 2 });
    state = { ...state, [side]: { ...state[side], stacks: { ...state[side].stacks, tier7: { formula: { stages: 2, seenSkillIds: ["v2c_elementallord_surge"] } } } } };
    const next = cast(state, side).state;
    expect(next[side].mp).toBe(10000);
    expect(next[side].stacks.unexplored?.paidDirectSkillCount).toBe(2);
    const plain = cast({ ...state, [side]: { ...state[side], player: { ...state[side].player, unexploredSetEffects: [] }, stacks: { ...state[side].stacks, unexplored: undefined } } }, side).state;
    expect(next[target].hp).toBe(plain[target].hp);
  });
  it("excludes charge preparation and free release from crystal while release consumes revenge", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    let state = withRuntime(battle(side, fighter({ hp: 500, strStat: 200, unexploredSetEffects: effects("crystal_focus", "battle_revenge") }), fighter({ hp: 10000, maxHp: 10000 }), ["v2c_ruinblade_ruinsword"]), side, { paidDirectSkillCount: 2, revengePending: true });
    state = { ...state, [side]: { ...state[side], stacks: { ...state[side].stacks, tier7: { swordIntent: 3 } } } };
    const charge = cast(state, side).state;
    expect(charge[side].mp).toBeLessThan(state[side].mp);
    expect(charge[side].stacks.unexplored).toMatchObject({ paidDirectSkillCount: 2, revengePending: true });
    const released = cast(prepare(charge, side), side).state;
    expect(released[side].mp).toBe(charge[side].mp);
    expect(released[side].stacks.unexplored).toMatchObject({ paidDirectSkillCount: 2, revengePending: false });
  });
  it("failed casts and utilities do not advance offensive counters", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const initial = withRuntime(battle(side, fighter({ unexploredSetEffects: effects("crystal_focus", "battle_revenge", "mana_redeployment") }), fighter(), ["v2c_martial_combo"]), side, { paidDirectSkillCount: 2, revengePending: true });
    const failed = cast({ ...initial, [side]: { ...initial[side], mp: 0 } }, side);
    expect(failed.castFired).toBe(false);
    expect(failed.state[side].stacks.unexplored).toMatchObject({ paidDirectSkillCount: 2, revengePending: true, manaSkillCount: 0 });
  });
  it("does not boost independent damage or spend revenge on a fully shielded direct body", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const state = withRuntime(battle(side, fighter({ heavenDecreeChancePct: 100, unexploredSetEffects: effects("battle_revenge") }), fighter({ hp: 10000, maxHp: 10000 })), side, { revengePending: true });
    const ordinary = basic(withRuntime(state, side, { revengePending: false }));
    const boosted = basic(state);
    expect(ordinary[target].hp - boosted[target].hp).toBe(20);
    const shielded = basic({ ...state, [target]: { ...state[target], stacks: { ...state[target].stacks, playerShield: 120 } } });
    expect(shielded[target].hp).toBeLessThan(10000); // Only independent decree reaches HP.
    expect(shielded[side].stacks.unexplored?.revengePending).toBe(true);
  });
  it.each([
    { label: "vulnerability", vuln: 20, down: 0, decree: false, barrier: false, execution: false, damage: 144 },
    { label: "damage down", vuln: 0, down: 20, decree: false, barrier: false, execution: false, damage: 96 },
    { label: "vulnerability with decree", vuln: 20, down: 0, decree: true, barrier: false, execution: false, damage: 204 },
    { label: "damage down with decree", vuln: 0, down: 20, decree: true, barrier: false, execution: false, damage: 136 },
    { label: "both modifiers with decree", vuln: 20, down: 20, decree: true, barrier: false, execution: false, damage: 163 },
    { label: "vulnerability with durability", vuln: 20, down: 0, decree: false, barrier: true, execution: false, damage: 108 },
    { label: "vulnerability with decree and durability", vuln: 20, down: 0, decree: true, barrier: true, execution: false, damage: 168 },
    { label: "execution bypass with vulnerability and decree", vuln: 20, down: 0, decree: true, barrier: true, execution: true, damage: 348 },
  ])("preserves modified direct partitions through $label before revenge", ({ vuln, down, decree, barrier, execution, damage }) => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    let state = withRuntime(battle(side, fighter({
      heavenDecreeChancePct: decree ? 100 : 0,
      executionDamageMult: execution ? 2 : 1, executionHpFraction: 0.6,
      unexploredSetEffects: effects("battle_revenge"),
    }), fighter({ maxHp: 2000, magicBarrierMax: barrier ? 100 : 0, magicBarrierPvpAbsorbPct: 25, magicBarrierPvpEfficiencyPct: 0 })), side, { revengePending: true });
    state = { ...state, [side]: { ...state[side], stacks: { ...state[side].stacks,
      enemyVulnPct: vuln, enemyVulnTurns: 2, damageDownPct: down, damageDownTurns: 2,
    } } };
    const next = basic(state);
    expect(state[target].hp - next[target].hp).toBe(damage);
    expect(next[side].stacks.unexplored?.revengePending).toBe(false);
  });
  it("independent reflection and counters neither trigger defensive sets nor spend offensive sets", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player = fighter({ hp: 350, unexploredSetEffects: effects("unyielding_dead", "iron_wall", "battle_revenge"), passiveCounterChancePct: 100 });
    const state = withRuntime(battle(side, player, fighter({ thornsPct: 100 })), side, { revengePending: true });
    const reflected = applyOnHitReflect(state, side, target, 100, false).state;
    expect(reflected[side].hp).toBe(250);
    expect(reflected[side].stacks.unexplored).toMatchObject({ revengePending: true, ironWallDefBonus: 0, enemyActionHpDamage: 0 });
    const countered = maybeApplyMartialCounter(state, target, side, false).state;
    expect(countered[target].hp).toBe(900);
    expect(countered[side].stacks.unexplored?.revengePending).toBe(true);
  });
  it.each([
    { label: "50 direct plus 47 decree", atk: 100, hp: 940, maxHp: 1000, shield: 0, endurance: false, barrier: false, hpAfter: 843, direct: 50, iron: 0, revenge: true },
    { label: "one shield below the revenge boundary", atk: 100, hp: 940, maxHp: 1000, shield: 1, endurance: false, barrier: false, hpAfter: 844, direct: 49, iron: 0, revenge: false },
    { label: "50 direct after partial shield", atk: 107, hp: 940, maxHp: 1000, shield: 7, endurance: false, barrier: false, hpAfter: 843, direct: 50, iron: 0, revenge: true },
    { label: "400 direct plus 139 decree at the iron boundary", atk: 450, hp: 2780, maxHp: 3000, shield: 0, endurance: false, barrier: false, hpAfter: 2241, direct: 400, iron: 3, revenge: true },
    { label: "49 actual HP after survival", atk: 150, hp: 50, maxHp: 1000, shield: 0, endurance: true, barrier: false, hpAfter: 1, direct: 49, iron: 0, revenge: false },
    { label: "50 direct including durability spill after shield", atk: 150, hp: 940, maxHp: 1000, shield: 30, endurance: false, barrier: true, hpAfter: 843, direct: 50, iron: 0, revenge: true },
  ])("attributes exact integer HP for $label", ({ atk, hp, maxHp, shield, endurance, barrier, hpAfter, direct, iron, revenge }) => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const state = battle(target, fighter({ atk, heavenDecreeChancePct: 100 }), fighter({
      hp, maxHp, def: 50, bulwarkShield: shield, enduranceActive: endurance,
      magicBarrierMax: barrier ? 20 : 0, magicBarrierPvpAbsorbPct: 50, magicBarrierPvpEfficiencyPct: 0,
      unexploredSetEffects: effects("battle_revenge", "iron_wall"),
    }));
    const hit = basic(prepare(state, target, 2));
    expect(hit[side].hp).toBe(hpAfter);
    expect(hit[side].stacks.unexplored).toMatchObject({ enemyActionHpDamage: direct, ironWallDefBonus: iron });
    const next = endAttackerPhase(hit, target, side, { tickDefenderDots: false });
    expect(next[side].stacks.unexplored?.revengePending).toBe(revenge);
  });
  it("excludes HP preserved by endurance from revenge and iron on skill multihits", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const state = battle(target, fighter(), fighter({ hp: 50, enduranceActive: true, unexploredSetEffects: effects("battle_revenge", "iron_wall") }), ["v2c_martial_combo"]);
    const hit = cast(state, target).state;
    const next = endAttackerPhase(hit, target, side, { tickDefenderDots: false });
    expect(next[side].hp).toBe(1);
    expect(next[side].stacks.unexplored).toMatchObject({ revengePending: false, ironWallDefBonus: 0 });
  });
  it("keeps mana durability partition before unyielding body reduction", () => {
    const state = battle(target, fighter(), fighter({ hp: 350, magicBarrierMax: 20, magicBarrierPvpAbsorbPct: 25, magicBarrierPvpEfficiencyPct: 0, bulwarkShield: 10, passiveDamageTakenReductionPct: 20, unexploredSetEffects: effects("unyielding_dead") }));
    const next = basic(state);
    expect(next[side].magicBarrier).toBe(0);
    expect(next[side].hp).toBe(305); // 75 body -> 63 -> 50, plus 5 durability spill, minus 10 shield.
  });
  it("consumes afterimage before newly generated heal shields and replenishes only its own pool", () => {
    let state = withRuntime(battle(target, fighter({ atk: 400 }), fighter({ hp: 800, evasionPct: 100, bloodfeastPct: 100, unexploredSetEffects: effects("afterimage_coating"), equipSignatures: [{ trigger: "on_heal", label: "회복 보호막", healToShieldPct: 100 }] })), side, { afterimageShield: 30 });
    state = { ...state, [side]: { ...state[side], stacks: { ...state[side].stacks, playerShield: 30 } } };
    const next = basic(state);
    expect(next[side].hp).toBe(800);
    expect(next[side].stacks.unexplored?.afterimageShield).toBe(12); // 85 prevented -> floor(12.75).
    expect(next[side].stacks.playerShield).toBe(297); // 285 new heal shield + 12 afterimage.
  });
  it.each([
    { shield: 30, shadow: 30, remaining: 0, finalAfterimage: 3, finalShield: 76 },
    { shield: 30, shadow: 20, remaining: 10, finalAfterimage: 13, finalShield: 76 },
    { shield: 70, shadow: 20, remaining: 30, finalAfterimage: 30, finalShield: 73 },
    { shield: 70, shadow: 50, remaining: 20, finalAfterimage: 23, finalShield: 76 },
  ])("consumes afterimage ownership when sword shadow absorbs $shadow of $shield shield", ({ shield, shadow, remaining, finalAfterimage, finalShield }) => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    let state = withRuntime(battle(side, fighter({
      evasionPct: 100, passiveDamageTakenReductionPct: 90,
      unexploredSetEffects: effects("afterimage_coating", "mana_redeployment"),
    }), fighter(), ["v2c_warrior_warcry"]), side, { afterimageShield: 30, manaSkillCount: 2 });
    state = { ...state,
      [side]: { ...state[side], stacks: { ...state[side].stacks, playerShield: shield } },
      [target]: { ...state[target], stacks: { ...state[target].stacks, tier7: { swordShadow: {
        sourceSkillId: "v2c_shadowblade_afterimage", sourceFinalDamage: shadow, recordPct: 100, refined: false,
      } } } },
    };
    const released = basic(state);
    expect(released[side].hp).toBe(1000);
    expect(released[side].stacks.playerShield).toBe(shield - shadow);
    expect(released[side].stacks.unexplored?.afterimageShield).toBe(remaining);
    const refreshed = cast(prepare(released, side), side).state;
    expect(refreshed[side].stacks.playerShield).toBe(80);
    const next = basic(prepare(refreshed, target)); // 100 -> 78 evasion -> 7 reduction; +3 coating.
    expect(next[side].stacks.playerShield).toBe(finalShield);
    expect(next[side].stacks.unexplored?.afterimageShield).toBe(finalAfterimage);
  });
  it.each([[0.249, 6], [0.25, 5]])("rolls chain once per complete skill at %s", (roll, hitCount) => {
    const random = vi.spyOn(Math, "random").mockReturnValueOnce(0).mockReturnValueOnce(roll).mockReturnValue(0);
    const state = battle(side, fighter({ unexploredSetEffects: effects("chain_drive") }), fighter(), ["v2c_martial_combo"]);
    const next = cast(state, side).state;
    expect(damageLines(next)).toHaveLength(hitCount);
    expect(random).toHaveBeenCalledTimes(2);
  });
  it("chain preserves a queued signature bonus without counting or generating another", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const state = battle(side, fighter({ unexploredSetEffects: effects("chain_drive"), equipSignatures: [{ trigger: "every_n_hits", label: "추가타", everyNHits: 5 }] }), fighter(), ["v2c_martial_combo"]);
    const next = cast(state, side);
    expect(next.signatureExtraActions).toBe(1);
    expect(next.state[side].stacks.signatureBonusAttacksLeft).toBe(1);
    expect(next.state[side].stacks.signatureHitCount).toBe(5);
    expect(damageLines(cast(withRuntime(state, side, { chainDriveResolving: true }), side).state)).toHaveLength(5);
  });
  it("leaves only the skill-generated every-third-hit basic after a chain proc", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const state = battle(side, fighter({
      unexploredSetEffects: effects("chain_drive"),
      equipSignatures: [{ trigger: "every_n_hits", label: "분쇄 도끼", everyNHits: 3 }],
    }), fighter(), ["v2c_martial_combo"]);
    const next = cast(state, side);
    expect(next.signatureExtraActions).toBe(1);
    expect(next.state[side].stacks.signatureBonusAttacksLeft).toBe(1);
    expect(next.state[side].stacks.signatureHitCount).toBe(5);
    expect(damageLines(next.state)).toHaveLength(6);
  });
  it("chain embedded basic suppresses weakpoint and tier-6 extra-attack hooks", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player = fighter({
      critChancePct: 100,
      weakpointExtraAttacks: 1,
      unexploredSetEffects: effects("chain_drive"),
      equipSignatures: [{ trigger: "tier6_unique", mechanic: "gale_circuit", label: "질풍 연계" }],
    });
    let state = withRuntime(battle(side, player), side, { chainDriveResolving: true });
    state = {
      ...state,
      [side]: {
        ...state[side],
        stacks: {
          ...state[side].stacks,
          tier6Uniques: {
            ...state[side].stacks.tier6Uniques!,
            galeEvents: ["dodge" as const, "hit" as const],
          },
        },
      },
    };
    const next = advanceTurnPvP(state, { kind: "attack" }, {
      tickDefenderDots: false,
      basicOrigin: "extra_basic",
      embeddedBasic: true,
      basicDamageMult: 0.6,
    });
    expect(next[side].attacksLeft).toBe(state[side].attacksLeft);
    expect(next[side].stacks.weakpointDefIgnoreLeft).toBe(0);
    expect(next[side].stacks.tier6Uniques?.galeEvents).toEqual(["dodge", "hit"]);
    expect(next.log.some(entry => entry.text.includes("약점 적중") || entry.text.includes("질풍 연계"))).toBe(false);
  });
  it.each([["legacy", resolveBattlePvP], ["ATB", resolveBattlePvPAtb]] as const)("%s completes a lethal chain with exactly one colony recovery", (_mode, resolve) => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player = fighter({ hp: 500, extraBasicAttackDamagePct: 20, unexploredSetEffects: effects("chain_drive", "colony_regeneration") });
    const opponent = fighter({ hp: 200, maxHp: 1000 });
    const skills = { learned: ["v2c_martial_combo" as const], equipped: ["v2c_martial_combo" as const] };
    const next = resolve(side === "p1" ? player : opponent, side === "p2" ? player : opponent, "P1", "P2", {
      pickAction: () => ({ kind: "attack" }), potions: { p1: {}, p2: {} }, initiativeRoll: side === "p1" ? 0 : 0.999,
      v2Skills: { [side]: skills },
    }).finalState;
    expect(next[side].hp).toBe(520);
    expect(next[target].hp).toBe(0);
    expect(next.log.filter(e => e.text.includes("[군체 재생]"))).toHaveLength(1);
    expect(next.log.filter(e => e.text.includes("쓰러졌다"))).toHaveLength(1);
  });
  it.each([["legacy", resolveBattlePvP], ["ATB", resolveBattlePvPAtb]] as const)("%s marks generated basics extra and completes colony after the terminal hit", (_mode, resolve) => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player = fighter({ hp: 500, basicAttackDamagePct: 15, extraBasicAttackDamagePct: 20, unexploredSetEffects: effects("precision_shot", "colony_regeneration"), equipSignatures: [{ trigger: "every_n_hits", label: "추가타", everyNHits: 5 }] });
    const opponent = fighter({ hp: 200 });
    const skills = { learned: ["v2c_martial_combo" as const], equipped: ["v2c_martial_combo" as const] };
    const next = resolve(side === "p1" ? player : opponent, side === "p2" ? player : opponent, "P1", "P2", {
      pickAction: () => ({ kind: "attack" }), potions: { p1: {}, p2: {} }, initiativeRoll: side === "p1" ? 0 : 0.999,
      v2Skills: { [side]: skills },
    }).finalState;
    expect(damageLines(next)).toEqual([26, 26, 26, 26, 26, 120]);
    expect(next[side].hp).toBe(520);
    expect(next[side].stacks.unexplored?.manualBasicAttackCount).toBe(0);
    expect(next.log.filter(e => e.text.includes("[군체 재생]"))).toHaveLength(1);
  });
  it("reschedules a queued ATB action on frost onset and expires after two target actions", () => {
    vi.spyOn(Math, "random").mockReturnValueOnce(0).mockReturnValue(0.99);
    const source = fighter({ hp: 10000, maxHp: 10000, atk: 1, critChancePct: 75, unexploredSetEffects: effects("frost_mark", "freezing_lock") });
    const opponent = fighter({ hp: 10000, maxHp: 10000, atk: 1 });
    const next = resolveBattlePvPAtb(side === "p1" ? source : opponent, side === "p2" ? source : opponent, "P1", "P2", {
      pickAction: () => ({ kind: "attack" }), potions: { p1: {}, p2: {} }, initiativeRoll: side === "p1" ? 0.999 : 0,
    }).finalState;
    expect(next.log.filter(e => e.side === target && e.kind === "player_attack").slice(0, 4).map(e => e.t)).toEqual([0, 112, 224, 324]);
    expect(next.log.filter(e => e.text.includes("[서리 표식]"))).toHaveLength(1);
    expect(next[target].unexploredDebuffs).toBeUndefined();
  });
  it("logs evasion prevention before revenge and unyielding change the final body", () => {
    const state = withRuntime(battle(side, fighter({ unexploredSetEffects: effects("battle_revenge") }), fighter({ hp: 350, evasionPct: 100, unexploredSetEffects: effects("unyielding_dead", "afterimage_coating") })), side, { revengePending: true });
    const next = basic(state);
    // 21.25% PvP evasion: 100 -> 78; revenge 93; unyielding 79.
    expect(next[target].hp).toBe(271);
    expect(next.log.filter(e => e.text.includes("회피 경감")).map(e => e.text)).toEqual([expect.stringMatching(/피해 -22$/)]);
    expect(next[target].stacks.unexplored?.afterimageShield).toBe(3);
  });
  it.each([[1, 151.2], [2, 190.4]])("adds tectonic delay after frost reschedules old progress (%i critical casts)", (casts, firstTargetTick) => {
    const random = vi.spyOn(Math, "random");
    for (let i = 0; i < casts * 2; i++) random.mockReturnValueOnce(0);
    random.mockReturnValue(0.99);
    const source = fighter({ hp: 10000, maxHp: 10000, spd: casts === 1 ? 1 : 100, critChancePct: 75, unexploredSetEffects: effects("frost_mark", "freezing_lock") });
    const opponent = fighter({ hp: 10000, maxHp: 10000, atk: 1 });
    const skills = { learned: ["v2c_earthmage_tectonic" as const], equipped: ["v2c_earthmage_tectonic" as const] };
    const next = resolveBattlePvPAtb(side === "p1" ? source : opponent, side === "p2" ? source : opponent, "P1", "P2", {
      pickAction: () => ({ kind: "attack" }), potions: { p1: {}, p2: {} }, initiativeRoll: side === "p1" ? 0.999 : 0,
      v2Skills: { [side]: skills },
    }).finalState;
    const action = next.log.filter(e => e.side === target && e.kind === "player_attack")[1];
    expect(action?.t).toBeCloseTo(firstTargetTick, 8);
    expect(next.log.filter(e => e.text.includes("[서리 표식]") && (e.t ?? 0) < firstTargetTick)).toHaveLength(casts);
  });
  it("counts a shocked target action toward frost expiry without regenerating colony", () => {
    vi.spyOn(Math, "random").mockReturnValueOnce(0).mockReturnValue(0.99);
    const source = fighter({ hp: 10000, maxHp: 10000, atk: 1, critChancePct: 75, unexploredSetEffects: effects("frost_mark", "freezing_lock"), equipSignatures: [{ trigger: "on_hit", label: "감전", shockChancePct: 100 }] });
    const opponent = fighter({ hp: 5000, maxHp: 10000, atk: 1, unexploredSetEffects: effects("colony_regeneration") });
    const next = resolveBattlePvPAtb(side === "p1" ? source : opponent, side === "p2" ? source : opponent, "P1", "P2", {
      pickAction: () => ({ kind: "attack" }), potions: { p1: {}, p2: {} }, initiativeRoll: side === "p1" ? 0.999 : 0,
    }).finalState;
    const skipped = next.log.find(e => e.side === target && e.text.includes("움직이지 못했다"));
    expect(skipped?.t).toBe(112);
    expect(next.log.filter(e => e.kind === "hp_bar" && e.t === 112).at(-1)).toMatchObject({
      [target === "p1" ? "playerSignatureResources" : "enemySignatureResources"]: { unexploredFrost: "서리 표식 1행동" },
    });
    expect(next.log.some(e => e.t === 112 && e.text.includes("[군체 재생]"))).toBe(false);
    const afterExpiry = next.log.filter(e => e.kind === "hp_bar").find(e => e.t === 224);
    expect(afterExpiry?.[target === "p1" ? "playerSignatureResources" : "enemySignatureResources"]?.unexploredFrost).toBeUndefined();
  });
  it.each([
    { label: "first lethal critical", casterHp: 100, evades: 0, hits: 1, hpAfter: 0 },
    { label: "second lethal critical", casterHp: 250, evades: 0, hits: 2, hpAfter: 0 },
    { label: "nonterminal criticals", casterHp: 1000, evades: 0, hits: 2, hpAfter: 640 },
    { label: "fully evaded attempts", casterHp: 1000, evades: 2, hits: 0, hpAfter: 1000 },
  ])("preserves the provoked fighter's scheduled action after $label", ({ casterHp, evades, hits, hpAfter }) => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    let state = withRuntime(battle(target, fighter({ hp: casterHp, guaranteedEvades: evades }), fighter({
      hp: 500, critChancePct: 75, basicAttackDamagePct: 15, extraBasicAttackDamagePct: 20,
      unexploredSetEffects: effects("colony_regeneration", "precision_shot", "battle_revenge"),
    }), ["v2c_warden_aegis"]), side, { manualBasicAttackCount: 3, revengePending: true });
    state = { ...state, [side]: { ...state[side], unexploredDebuffs: {
      frostActions: 2, speedReductionPct: 20, accuracyPenalty: 12,
    } } };
    const result = cast(state, target);
    const next = result.state;
    expect(result.castFired).toBe(true);
    expect(damageLines(next)).toEqual(Array(hits).fill(180));
    expect(next[target].hp).toBe(hpAfter);
    expect.soft(next[side].hp).toBe(500);
    expect.soft(next[side].unexploredDebuffs).toEqual(state[side].unexploredDebuffs);
    expect.soft(next[side].attacksLeft).toBe(state[side].attacksLeft);
    expect.soft(next[side].turn).toEqual(state[side].turn);
    expect(next[side].stacks.unexplored).toMatchObject({ manualBasicAttackCount: 3, revengePending: true });
    expect(next.log.some(e => e.side === side && e.text.includes("[군체 재생]"))).toBe(false);
  });
  it("records afterimage consumed by independent freeze before returning from a skill", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    let state = battle(side, fighter({ intStat: 100 }), fighter({ unexploredSetEffects: effects("afterimage_coating") }), ["v2c_cryomancer_absolutezero"]);
    state = { ...state, [target]: { ...state[target], stacks: { ...state[target].stacks, frostChillStacks: 2 } } };
    const baseline = cast(state, side).state;
    const directDamage = damageLines(baseline)[0];
    expect(damageLines(baseline)[1]).toBeGreaterThan(30);
    state = withRuntime({ ...state, [target]: { ...state[target], stacks: { ...state[target].stacks, playerShield: directDamage + 30 } } }, target, { afterimageShield: 30 });
    const next = cast(state, side).state;
    expect(next[target].stacks.playerShield).toBe(0);
    expect(next[target].stacks.unexplored?.afterimageShield).toBe(0);
    expect(next[target].stacks.unexplored?.evasionReducedThisEnemyAction).toBe(0);
  });
  it("does not strengthen or mitigate independent freeze with direct-only sets", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    let state = battle(side, fighter({ intStat: 100, unexploredSetEffects: effects("battle_revenge", "crystal_focus", "colossus_crush") }), fighter({ hp: 3500, maxHp: 10000, unexploredSetEffects: effects("unyielding_dead") }), ["v2c_cryomancer_absolutezero"]);
    state = withRuntime({ ...state, [target]: { ...state[target], stacks: { ...state[target].stacks, frostChillStacks: 2 } } }, side, { revengePending: true, paidDirectSkillCount: 2 });
    const enhanced = cast(state, side).state;
    const plain = cast({ ...state,
      [side]: { ...state[side], player: { ...state[side].player, unexploredSetEffects: [] } },
      [target]: { ...state[target], player: { ...state[target].player, unexploredSetEffects: [] } },
    }, side).state;
    expect(damageLines(enhanced).at(-1)).toBe(damageLines(plain).at(-1));
    expect(damageLines(enhanced)[0]).not.toBe(damageLines(plain)[0]);
  });
  it("refreshes the third mana shield after the chain and its reflection settle", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    let state = battle(side, fighter({ unexploredSetEffects: effects("mana_redeployment", "chain_drive") }), fighter({ hp: 10000, maxHp: 10000, thornsPct: 100 }), ["v2c_martial_combo"]);
    state = withRuntime({ ...state, [side]: { ...state[side], stacks: { ...state[side].stacks, playerShield: 0 } } }, side, { manaSkillCount: 2 });
    const next = cast(state, side).state;
    expect(next[side].hp).toBe(810); // 130 skill reflect, then 60 chain reflect, then the 80-point refresh.
    expect(next[side].stacks.playerShield).toBe(80);
    expect(next[side].stacks.unexplored?.manaSkillCount).toBe(0);
  });
});

it("omitted and empty effects retain complete legacy and ATB states/logs", () => {
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  for (const resolve of [resolveBattlePvP, resolveBattlePvPAtb]) {
    const ctx = { pickAction: () => ({ kind: "attack" as const }), potions: { p1: {}, p2: {} }, initiativeRoll: 0 };
    const plain = resolve(fighter(), fighter(), "P1", "P2", ctx);
    const empty = resolve(fighter({ unexploredSetEffects: [] }), fighter({ unexploredSetEffects: [] }), "P1", "P2", ctx);
    expect(empty.finalState.log).toEqual(plain.finalState.log);
    expect(empty.finalState.p1.stacks).toEqual(plain.finalState.p1.stacks);
    expect(empty.finalState.p2.stacks).toEqual(plain.finalState.p2.stacks);
    expect(plain.finalState.p1.stacks.unexplored).toBeUndefined();
  }
});
