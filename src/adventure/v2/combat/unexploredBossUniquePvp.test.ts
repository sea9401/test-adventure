import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/adventure/data/v2/coreLoopConfig", async original => ({
  ...await original<typeof import("@/adventure/data/v2/coreLoopConfig")>(),
  V2_CORE_LOOP_V2: false,
  V2_ATB_SKILLS: true,
}));
import type { UnexploredBossEffectKind } from "@/adventure/data/v2/unexploredBossUniqueEffects";
import type { V2SkillId } from "@/adventure/data/v2/v2Skills";
import type { PlayerCombat } from "./engine";
import { advanceTurnPvP, castV2SkillOnAttackerTurnPvP, endAttackerPhase, initialBattleStatePvP, resolveBattlePvP, type PvPBattleState } from "./engine-pvp";
import { effectiveSideSpd } from "./engine.pvp-atb";
import type { BossUniqueRuntime } from "./unexploredBossUniqueEffects";

type Side = "p1" | "p2";
const fighter = (overrides: Partial<PlayerCombat> = {}): PlayerCombat => ({
  hp: 1000, maxHp: 1000, mp: 1000, maxMp: 1000, atk: 100, magicAtk: 100,
  def: 0, magicDef: 0, spd: 100, critChancePct: 0, critMult: 1.5,
  evasionPct: 0, accuracyPct: 100, attackCount: 1, ...overrides,
});
const boss = (kinds: UnexploredBossEffectKind[], overrides: Partial<PlayerCombat> = {}) => fighter({ unexploredBossEffects: kinds, ...overrides });
const other = (side: Side): Side => side === "p1" ? "p2" : "p1";
// `actor` acts first; `owner` gets `ownerPlayer`.
function battle(actor: Side, owner: Side, ownerPlayer: PlayerCombat, opponent = fighter()): PvPBattleState {
  const p1 = owner === "p1" ? ownerPlayer : opponent;
  const p2 = owner === "p2" ? ownerPlayer : opponent;
  return initialBattleStatePvP(p1, p2, "P1", "P2", undefined, undefined, undefined, undefined, actor);
}
const withBoss = (state: PvPBattleState, side: Side, fields: Partial<BossUniqueRuntime>): PvPBattleState => ({
  ...state, [side]: { ...state[side], stacks: { ...state[side].stacks, unexploredBoss: { ...state[side].stacks.unexploredBoss!, ...fields } } },
});
const prepare = (state: PvPBattleState, actor: Side): PvPBattleState => ({
  ...state, phase: actor, [actor]: { ...state[actor], attacksLeft: 1, turn: { ...state[actor].turn, firstAttackPending: true } },
});
const basic = (state: PvPBattleState) => advanceTurnPvP(state, { kind: "attack" }, { tickDefenderDots: false });
const action = (state: PvPBattleState, actor: Side) => endAttackerPhase(basic(prepare(state, actor)), actor, other(actor), { tickDefenderDots: false });
const logsOf = (state: PvPBattleState, prefix: string) => state.log.filter(e => e.text.startsWith(prefix));
afterEach(() => vi.restoreAllMocks());

describe.each(["p1", "p2"] as const)("%s boss unique PvP", side => {
  const target = other(side);

  it("initializes only the owner and scales the starting bulwark by sustain", () => {
    const initial = battle(side, side, boss(["invincible_bulwark"]));
    expect(initial[side].stacks.unexploredBoss?.bulwarkShield).toBe(150);
    expect(initial[side].stacks.playerShield).toBe(150);
    expect(initial[target].stacks.unexploredBoss).toBeUndefined();
    const p1 = side === "p1" ? boss(["invincible_bulwark"]) : fighter();
    const p2 = side === "p2" ? boss(["invincible_bulwark"]) : fighter();
    const scaled = initialBattleStatePvP(p1, p2, "P1", "P2", undefined, undefined, 0.65, 0.65, side);
    expect(scaled[side].stacks.playerShield).toBe(97);
    expect(scaled[side].stacks.unexploredBoss?.bulwarkShield).toBe(97);
  });

  it("tracking edge grows direct basic damage per hit", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    let state = battle(side, side, boss(["tracking_edge"]), fighter({ hp: 100000, maxHp: 100000 }));
    const dealt: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const next = basic(prepare(state, side));
      dealt.push(state[target].hp - next[target].hp);
      state = next;
    }
    expect(dealt[1]).toBeGreaterThan(dealt[0]!);
    expect(dealt[2]).toBeGreaterThan(dealt[1]!);
    expect(state[side].stacks.unexploredBoss?.orbitCalc).toBe(3);
  });

  it("absolute zero freezes the opponent through the shock state and chill slows it", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const initial = withBoss(battle(side, side, boss(["absolute_zero"])), side, { targetChill: 8 });
    const next = basic(prepare(initial, side));
    expect(next[target].stacks.shockAction).toBe("pending");
    expect(logsOf(next, "[절대영도]")).toHaveLength(1);
    const chilled = withBoss(initial, side, { targetChill: 10 });
    const plain = withBoss(initial, side, { targetChill: 0 });
    expect(effectiveSideSpd(chilled, target)).toBeCloseTo(effectiveSideSpd(plain, target) * 0.8);
  });

  it("coagulated venom poisons the attacker after three damaged actions", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    let state = battle(target, side, boss(["coagulated_venom"], { hp: 100000, maxHp: 100000 }));
    for (let i = 0; i < 3; i += 1) state = action(state, target);
    expect(logsOf(state, "[응고독 반격]")).toHaveLength(1);
    expect(state[target].v2Dots.find(dot => dot.tag === "poison")?.stacks).toBe(2);
  });

  it("eternal life saves once in PvP", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const initial = battle(target, side, boss(["eternal_life"], { hp: 50 }), fighter({ atk: 5000 }));
    const saved = basic(prepare(initial, target));
    expect(saved[side].hp).toBe(350);
    expect(saved.phase).not.toBe("ended");
    expect(logsOf(endAttackerPhase(saved, target, side, { tickDefenderDots: false }), "[영겁]")).toHaveLength(1);
    const dead = basic(prepare({ ...saved, [side]: { ...saved[side], hp: 50 } }, target));
    expect(dead[side].hp).toBe(0);
  });
});

// 건의 #846: 아레나 스킬 시전이 공격 시작 훅의 상태·로그를 버려 별궤 조준·보정 사격 표시가 안 나오고
// 다음 공격 보너스가 소비되지 않아 계속 붙던 문제.
describe.each(["p1", "p2"] as const)("%s boss unique PvP direct skill casts", side => {
  const skills: V2SkillId[] = ["v2c_martial_combo"];
  const castBattle = (kinds: UnexploredBossEffectKind[]) => initialBattleStatePvP(
    side === "p1" ? boss(kinds) : fighter({ hp: 100000, maxHp: 100000 }),
    side === "p2" ? boss(kinds) : fighter({ hp: 100000, maxHp: 100000 }),
    "P1", "P2",
    side === "p1" ? { learned: skills, equipped: skills } : undefined,
    side === "p2" ? { learned: skills, equipped: skills } : undefined,
    undefined, undefined, side,
  );
  const cast = (state: PvPBattleState) => castV2SkillOnAttackerTurnPvP(prepare(state, side), side).state;

  it("logs and consumes pending next-attack bonuses", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const initial = withBoss(castBattle(["starpath_aim", "prismatic_correction"]), side, {
      starpathPending: true, correctionPending: true, freezeBonusPending: true,
    });
    const next = cast(initial);
    expect(logsOf(next, "[별궤 조준]")).toHaveLength(1);
    expect(logsOf(next, "[보정 사격]")).toHaveLength(1);
    expect(logsOf(next, "[빙결 일격]")).toHaveLength(1);
    expect(next[side].stacks.unexploredBoss).toMatchObject({ correctionPending: false, correctionHits: 1, freezeBonusPending: false });
  });

  it("resets orbit pursuit after an orbit cut", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const next = cast(withBoss(castBattle(["infinite_orbit"]), side, { pursuit: 10 }));
    expect(logsOf(next, "[궤도 절단]")).toHaveLength(1);
    expect(next[side].stacks.unexploredBoss?.pursuit).toBe(1);
  });
});

describe("PvP without boss effects", () => {
  it("no boss effects leaves battle unchanged", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.3);
    const ctx = { pickAction: () => ({ kind: "attack" as const }), potions: { p1: {}, p2: {} } };
    const a = resolveBattlePvP(fighter(), fighter(), "P1", "P2", ctx);
    const b = resolveBattlePvP(fighter({ unexploredBossEffects: [] }), fighter({ unexploredBossEffects: [] }), "P1", "P2", ctx);
    expect(b.finalState.log).toEqual(a.finalState.log);
    expect(initialBattleStatePvP(fighter(), fighter(), "P1", "P2").p1.stacks).not.toHaveProperty("unexploredBoss");
  });
});
