import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/adventure/data/v2/coreLoopConfig", async importOriginal => ({
  ...await importOriginal<typeof import("@/adventure/data/v2/coreLoopConfig")>(),
  V2_CORE_LOOP_V2: false,
}));
import type { Monster } from "@/adventure/data/monsters";
import type { UnexploredBossEffectKind } from "@/adventure/data/v2/unexploredBossUniqueEffects";
import { initialBattleState, resolveBattle, type BattleState, type PlayerCombat } from "./engine";
import { resolvePlayerPhase } from "./engine.playerPhase";
import { resolveEnemyPhase } from "./engine.enemyPhase";
import { resolveBattleAtb } from "./engine.atb";
import { effectiveEnemyTimelineSpd, effectivePlayerSpd } from "./engine.atbSpeed";
import type { BossUniqueRuntime } from "./unexploredBossUniqueEffects";

const PLAYER: PlayerCombat = { hp: 1000, maxHp: 1000, mp: 1000, maxMp: 1000, atk: 100, def: 0, spd: 50, evasionPct: 0, accuracyPct: 100, attackCount: 1 };
const ENEMY: Monster = { name: "표적", tags: [], hp: 100000, atk: 100, def: 0, spd: 1, exp: 0 };
const withBoss = (...kinds: UnexploredBossEffectKind[]): PlayerCombat => ({ ...PLAYER, unexploredBossEffects: kinds });
const runtime = (state: BattleState, fields: Partial<BossUniqueRuntime>): BattleState => ({
  ...state, unexploredBossRuntime: { ...state.unexploredBossRuntime!, ...fields },
});
const attack = (state: BattleState, player: PlayerCombat) =>
  resolvePlayerPhase({ ...state, phase: "player" }, player, "용사", { kind: "attack" });
const enemyHit = (state: BattleState, player: PlayerCombat) =>
  resolveEnemyPhase({ ...state, phase: "enemy", turn: { ...state.turn, enemyAttacksLeft: 1 } }, player, "용사", true);
const logsOf = (state: BattleState, prefix: string) => state.log.filter(e => e.text.startsWith(prefix));
afterEach(() => vi.restoreAllMocks());

describe("PvE boss unique wiring", () => {
  it("no boss effects leaves battle unchanged", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.3);
    const plain = initialBattleState(PLAYER, ENEMY, "용사");
    expect(plain).not.toHaveProperty("unexploredBossRuntime");
    const a = resolveBattle(PLAYER, ENEMY, "용사", { pickAction: () => ({ kind: "attack" }), potions: {}, maxTurns: 3 });
    const b = resolveBattle({ ...PLAYER, unexploredBossEffects: [] }, ENEMY, "용사", { pickAction: () => ({ kind: "attack" }), potions: {}, maxTurns: 3 });
    expect(b.finalState.log).toEqual(a.finalState.log);
    expect(b.finalState.playerHp).toBe(a.finalState.playerHp);
  });

  it("tracking edge grows direct basic damage 3% per hit", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const player = withBoss("tracking_edge");
    let state = initialBattleState(player, ENEMY, "용사");
    const dealt: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const next = attack(state, player);
      dealt.push(state.enemyHp - next.enemyHp);
      state = next;
    }
    const base = dealt[0]!;
    expect(dealt).toEqual([base, Math.floor(base * 1.03 + 1e-9), Math.floor(base * 1.06 + 1e-9)]);
    expect(state.unexploredBossRuntime?.orbitCalc).toBe(3);
  });

  it("infinite orbit ignores half of defense on the strike and logs it", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const player = withBoss("infinite_orbit");
    const enemy = { ...ENEMY, def: 80 };
    const initial = initialBattleState(player, enemy, "용사");
    const plain = initial.enemyHp - attack(initial, player).enemyHp;
    const strike = attack(runtime(initial, { pursuit: 10 }), player);
    expect(initial.enemyHp - strike.enemyHp).toBeGreaterThan(plain * 1.8);
    expect(logsOf(strike, "[궤도 절단]")).toHaveLength(1);
    expect(strike.unexploredBossRuntime?.pursuit).toBe(1);
  });

  it("starpath aim adds its stored crit chance to basic crit rolls", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.15);
    const player = { ...withBoss("starpath_aim"), critMult: 2 };
    const initial = initialBattleState(player, ENEMY, "용사");
    const normal = initial.enemyHp - attack(initial, player).enemyHp;
    const primed = attack(runtime(initial, { starpathCritPct: 20 }), player);
    expect(initial.enemyHp - primed.enemyHp).toBeGreaterThan(normal);
    expect(primed.unexploredBossRuntime?.starpathCritPct).toBe(0);
  });

  it("coagulated venom poisons the attacker on the third damaged enemy action", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const player = withBoss("coagulated_venom");
    let state = initialBattleState(player, ENEMY, "용사");
    for (let i = 0; i < 3; i += 1) state = enemyHit(state, player);
    expect(logsOf(state, "[응고독 반격]")).toHaveLength(1);
    expect(state.enemyV2Dots.find(dot => dot.tag === "poison")?.stacks).toBe(2);
  });

  it("uncorrupted heart cleanses dots, heals 12%, and strikes back for 8% max HP", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const player = withBoss("uncorrupted_heart");
    const poison = { tag: "poison" as const, label: "중독", stacks: 1, maxStacks: 10, turns: 3, flatPerStack: 10, atkCoefPerStack: 0, pctMaxHpPerStack: 0, sourceAtk: 0 };
    const initial = runtime({ ...initialBattleState(player, ENEMY, "용사"), playerHp: 500, playerV2Dots: [poison] }, { toxicBlood: 9 });
    const plainPlayer = withBoss();
    const plain = enemyHit({ ...initialBattleState(plainPlayer, ENEMY, "용사"), playerHp: 500 }, plainPlayer);
    const next = enemyHit(initial, player);
    expect(logsOf(next, "[독혈 역류]").length).toBeGreaterThan(0);
    expect(next.playerV2Dots).toEqual([]);
    expect(next.playerHp).toBe(plain.playerHp + 120);
    expect(initial.enemyHp - next.enemyHp).toBe(80);
    expect(next.enemyV2Dots.find(dot => dot.tag === "poison")?.stacks).toBe(3);
  });

  it("absolute zero freezes through the shock state and slows by chill", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const player = withBoss("absolute_zero");
    const initial = runtime(initialBattleState(player, ENEMY, "용사"), { targetChill: 8 });
    const frozen = attack(initial, player);
    expect(frozen.stacks.enemyShockAction).toBe("pending");
    expect(logsOf(frozen, "[절대영도]")).toHaveLength(1);
    expect(frozen.unexploredBossRuntime?.freezeBonusPending).toBe(true);
    const chilled = runtime(initial, { targetChill: 10 });
    expect(effectiveEnemyTimelineSpd(chilled, 0)).toBeCloseTo(effectiveEnemyTimelineSpd(initial, 0) * 0.85 / 0.88);
  });

  it("freeze respects shock immunity", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const player = withBoss("absolute_zero");
    const initial = runtime(initialBattleState(player, ENEMY, "용사"), { targetChill: 8 });
    const immune = attack({ ...initial, stacks: { ...initial.stacks, enemyShockAction: "immune" } }, player);
    expect(immune.stacks.enemyShockAction).toBe("immune");
    expect(immune.unexploredBossRuntime?.freezeBonusPending).toBe(true);
  });

  it("starts with bulwark and magisteel shields and reduces damage while they hold", () => {
    const player = withBoss("invincible_bulwark", "magisteel_guard");
    const initial = initialBattleState(player, ENEMY, "용사");
    expect(initial.stacks.playerShield).toBe(200);
    expect(initial.unexploredBossRuntime?.bulwarkShield).toBe(150);
  });

  it("breaks the bulwark after other shields and reflects 40% of its size", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const player = withBoss("invincible_bulwark");
    const strong = { ...ENEMY, atk: 400 };
    const initial = initialBattleState(player, strong, "용사");
    const next = enemyHit(initial, player);
    expect(next.stacks.playerShield).toBe(0);
    expect(logsOf(next, "[불괴 방벽 붕괴]")).toHaveLength(1);
    expect(initial.enemyHp - next.enemyHp).toBe(60);
  });

  it("eternal life saves a lethal hit at 35% max HP instead of dying", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const player = withBoss("eternal_life");
    const initial = { ...initialBattleState(player, { ...ENEMY, atk: 5000 }, "용사"), playerHp: 50 };
    const next = enemyHit(initial, player);
    expect(next.playerHp).toBe(350);
    expect(next.outcome).not.toBe("lose");
    expect(next.phase).not.toBe("ended");
    expect(logsOf(next, "[영겁]")).toHaveLength(1);
    expect(effectivePlayerSpd(player, next)).toBeCloseTo(effectivePlayerSpd(player, initial) * 1.15);
  });

  it("pulsing regen heals on own actions in an ATB battle", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const player = { ...withBoss("pulsing_regen"), hp: 500 };
    const result = resolveBattleAtb(player, { ...ENEMY, atk: 1 }, "용사", { pickAction: () => ({ kind: "attack" }), potions: {}, maxTurns: 1, forceAtbSkills: true });
    expect(logsOf(result.finalState, "[재생 고동]").length).toBeGreaterThan(0);
  });

  it("phantom haste pulls the next player action forward after a dodged enemy action", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const dodger = { ...withBoss("phantom_haste"), evasionPct: 95, spd: 50 };
    const enemy = { ...ENEMY, spd: 100, directActionSpd: true };
    const run = (player: PlayerCombat) => resolveBattleAtb(player, enemy, "용사", { pickAction: () => ({ kind: "attack" }), potions: {}, maxTurns: 3, forceAtbSkills: true });
    const hasted = run(dodger).finalState;
    const plain = run({ ...dodger, unexploredBossEffects: [] }).finalState;
    expect(logsOf(hasted, "[잔상 가속]").length).toBeGreaterThan(0);
    const playerTicks = (state: BattleState) => state.log.filter(e => e.kind === "player_attack").map(e => e.t ?? 0);
    expect(playerTicks(hasted)[1]).toBeLessThan(playerTicks(plain)[1]!);
  });
});
