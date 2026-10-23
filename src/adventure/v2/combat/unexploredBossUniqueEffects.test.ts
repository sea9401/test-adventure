import { describe, expect, it } from "vitest";
import type { UnexploredBossEffectKind } from "@/adventure/data/v2/unexploredBossUniqueEffects";
import {
  beginBossUniqueAttack,
  bossUniqueCritBonusPct,
  bossUniqueDamageTaken,
  bossUniqueLethalSave,
  bossUniqueResourceSnapshot,
  bossUniqueSelfSpeedMult,
  bossUniqueTargetSpeedMult,
  consumeBossUniqueHaste,
  finishBossUniqueAttack,
  finishBossUniqueEnemyAction,
  initialBossUniqueRuntime,
  recordBossUniqueHit,
  startBossUniquePlayerAction,
  type BossUniqueRuntime,
} from "./unexploredBossUniqueEffects";

const MAX_HP = 10_000;
const init = (...effects: UnexploredBossEffectKind[]) =>
  initialBossUniqueRuntime(effects, { maxHp: MAX_HP, pvp: false }).runtime;
const begin = (runtime: BossUniqueRuntime, effects: UnexploredBossEffectKind[], overrides: Partial<Parameters<typeof beginBossUniqueAttack>[2]> = {}) =>
  beginBossUniqueAttack(runtime, effects, { direct: true, targetPoisonStacks: 0, hp: MAX_HP, maxHp: MAX_HP, ...overrides });
const finish = (runtime: BossUniqueRuntime, effects: UnexploredBossEffectKind[], overrides: Partial<Parameters<typeof finishBossUniqueAttack>[2]> = {}) =>
  finishBossUniqueAttack(runtime, effects, { direct: true, hit: true, crit: false, atk: 1_000, magicAtk: 400, ...overrides });
const hitTaken = (runtime: BossUniqueRuntime, overrides: Partial<Parameters<typeof recordBossUniqueHit>[1]> = {}) =>
  recordBossUniqueHit(runtime, { fullyEvaded: false, evadedFraction: 0, hpDamage: 100, shieldAbsorbed: 0, shieldAfter: 0, ...overrides });
const endEnemy = (runtime: BossUniqueRuntime, effects: UnexploredBossEffectKind[], overrides: Partial<Parameters<typeof finishBossUniqueEnemyAction>[2]> = {}) =>
  finishBossUniqueEnemyAction(runtime, effects, { maxHp: MAX_HP, hasDots: false, ...overrides });
function hits(runtime: BossUniqueRuntime, effects: UnexploredBossEffectKind[], count: number, crit = false) {
  let commands: ReturnType<typeof finish>["commands"] = [];
  for (let i = 0; i < count; i += 1) {
    runtime = begin(runtime, effects).runtime;
    const done = finish(runtime, effects, { crit });
    runtime = done.runtime;
    commands = [...commands, ...done.commands];
  }
  return { runtime, commands };
}

describe("no effects", () => {
  it("returns identity values and no commands", () => {
    const runtime = init();
    expect(begin(runtime, [])).toMatchObject({ damageMult: 1, defenseMult: 1 });
    expect(finish(runtime, []).commands).toEqual([]);
    expect(endEnemy(hitTaken(runtime), []).commands).toEqual([]);
    expect(bossUniqueDamageTaken(runtime, [], { damage: 500, shield: 0 })).toBe(500);
    expect(bossUniqueCritBonusPct(runtime, [])).toBe(0);
    expect(bossUniqueSelfSpeedMult(runtime)).toBe(1);
    expect(bossUniqueTargetSpeedMult(runtime)).toBe(1);
    expect(initialBossUniqueRuntime([], { maxHp: MAX_HP, pvp: false }).startShield).toBe(0);
  });
});

describe("추적 병기", () => {
  it("tracking edge stacks 3% per direct hit up to 5 and resets on a full evade", () => {
    const effects: UnexploredBossEffectKind[] = ["tracking_edge"];
    let runtime = hits(init(...effects), effects, 7).runtime;
    expect(begin(runtime, effects).damageMult).toBeCloseTo(1.15);
    expect(begin(runtime, effects, { direct: false }).damageMult).toBe(1);
    runtime = finish(runtime, effects, { hit: false }).runtime;
    expect(begin(runtime, effects).damageMult).toBe(1);
  });
  it("phantom haste queues 15% after a full dodge, once per enemy action", () => {
    const effects: UnexploredBossEffectKind[] = ["phantom_haste"];
    let runtime = hitTaken(hitTaken(init(...effects), { fullyEvaded: true }), { fullyEvaded: true });
    runtime = endEnemy(runtime, effects).runtime;
    const consumed = consumeBossUniqueHaste(runtime);
    expect(consumed.pct).toBe(15);
    expect(consumeBossUniqueHaste(consumed.runtime).pct).toBe(0);
  });
  it("phantom haste scales with the largest evaded fraction of the action", () => {
    const effects: UnexploredBossEffectKind[] = ["phantom_haste"];
    let runtime = hitTaken(hitTaken(init(...effects), { evadedFraction: 0.4 }), { evadedFraction: 0.85 });
    runtime = endEnemy(runtime, effects).runtime;
    expect(consumeBossUniqueHaste(runtime).pct).toBeCloseTo(12.75);
    expect(consumeBossUniqueHaste(endEnemy(hitTaken(init(...effects)), effects).runtime).pct).toBe(0);
  });
  it("infinite orbit releases a 50% defense-ignoring +80% strike after 10 hits", () => {
    const effects: UnexploredBossEffectKind[] = ["infinite_orbit"];
    const runtime = hits(init(...effects), effects, 10).runtime;
    const strike = begin(runtime, effects);
    expect(strike.damageMult).toBeCloseTo(1.8);
    expect(strike.defenseMult).toBe(0.5);
    expect(strike.logs).toContain("궤도 절단");
    expect(begin(strike.runtime, effects).damageMult).toBe(1);
  });
});

describe("독혈 군주", () => {
  it("toxic claw adds 8% against targets with 5+ poison", () => {
    const runtime = init("toxic_claw");
    expect(begin(runtime, ["toxic_claw"], { targetPoisonStacks: 4 }).damageMult).toBe(1);
    expect(begin(runtime, ["toxic_claw"], { targetPoisonStacks: 5 }).damageMult).toBeCloseTo(1.08);
  });
  it("counts once per enemy action", () => {
    const effects: UnexploredBossEffectKind[] = ["coagulated_venom"];
    let runtime = init(...effects);
    for (let action = 0; action < 2; action += 1) {
      runtime = endEnemy(hitTaken(hitTaken(hitTaken(runtime))), effects).runtime;
    }
    expect(runtime.coagulation).toBe(2);
    const third = endEnemy(hitTaken(runtime), effects);
    expect(third.commands).toEqual([{ kind: "apply_poison", label: "응고독 반격", stacks: 2 }]);
    expect(third.runtime.coagulation).toBe(0);
  });
  it("ignores fully evaded actions for hit-taken stacks", () => {
    const runtime = endEnemy(hitTaken(init("coagulated_venom"), { fullyEvaded: true }), ["coagulated_venom"]).runtime;
    expect(runtime.coagulation).toBe(0);
  });
  it("uncorrupted heart cleanses, heals 12%, and strikes back on the 10th damaged action", () => {
    const effects: UnexploredBossEffectKind[] = ["uncorrupted_heart"];
    let runtime = init(...effects);
    for (let action = 0; action < 9; action += 1) runtime = endEnemy(hitTaken(runtime), effects).runtime;
    const burst = endEnemy(hitTaken(runtime, { hpDamage: 0, shieldAbsorbed: 50 }), effects);
    expect(burst.commands).toEqual([
      { kind: "cleanse_dots", label: "독혈 역류" },
      { kind: "heal", label: "독혈 역류", amount: 1_200 },
      { kind: "damage_fixed", label: "독혈 역류", amount: 800 },
      { kind: "apply_poison", label: "독혈 역류", stacks: 3 },
    ]);
    expect(burst.runtime.toxicBlood).toBe(0);
  });
});

describe("빙하 거수", () => {
  it("glacial crush and frozen bulwark share chill that slows 1.5% per stack up to 10", () => {
    const effects: UnexploredBossEffectKind[] = ["glacial_crush", "frozen_bulwark"];
    let runtime = hits(init(...effects), effects, 8).runtime;
    runtime = endEnemy(hitTaken(runtime), effects).runtime;
    expect(runtime.targetChill).toBe(9);
    runtime = hits(runtime, effects, 5).runtime;
    expect(runtime.targetChill).toBe(10);
    expect(bossUniqueTargetSpeedMult(runtime)).toBeCloseTo(0.85);
  });
  it("absolute zero freezes at 10 chill, consumes it, and boosts the next direct attack by 30%", () => {
    const effects: UnexploredBossEffectKind[] = ["absolute_zero"];
    const four = hits(init(...effects), effects, 4);
    expect(four.commands).toEqual([]);
    const fifth = hits(four.runtime, effects, 1);
    expect(fifth.commands).toEqual([{ kind: "freeze", label: "절대영도" }]);
    expect(fifth.runtime.targetChill).toBe(0);
    const boosted = begin(fifth.runtime, effects);
    expect(boosted.damageMult).toBeCloseTo(1.3);
    expect(begin(boosted.runtime, effects).damageMult).toBe(1);
  });
});

describe("불괴의 성채", () => {
  it("magisteel guard starts with a 5% shield and reduces damage 8% while any shield remains", () => {
    const start = initialBossUniqueRuntime(["magisteel_guard"], { maxHp: MAX_HP, pvp: false });
    expect(start.startShield).toBe(500);
    expect(bossUniqueDamageTaken(start.runtime, ["magisteel_guard"], { damage: 1_000, shield: 1 })).toBe(920);
    expect(bossUniqueDamageTaken(start.runtime, ["magisteel_guard"], { damage: 1_000, shield: 0 })).toBe(1_000);
  });
  it("sealing barrier grants a 4% shield while dotted, three times per battle", () => {
    const effects: UnexploredBossEffectKind[] = ["sealing_barrier"];
    let runtime = init(...effects);
    expect(endEnemy(runtime, effects).commands).toEqual([]);
    const granted: number[] = [];
    for (let action = 0; action < 4; action += 1) {
      const done = endEnemy(runtime, effects, { hasDots: true });
      runtime = done.runtime;
      granted.push(done.commands.length);
    }
    expect(granted).toEqual([1, 1, 1, 0]);
  });
  it("bulwark breaks only after own pool is gone, reflects 40%, and rebuilds after six actions", () => {
    const effects: UnexploredBossEffectKind[] = ["invincible_bulwark"];
    const start = initialBossUniqueRuntime(effects, { maxHp: MAX_HP, pvp: false });
    expect(start.startShield).toBe(1_500);
    let runtime = start.runtime;
    expect(bossUniqueDamageTaken(runtime, effects, { damage: 1_000, shield: 0 })).toBe(850);
    runtime = endEnemy(hitTaken(runtime, { hpDamage: 0, shieldAbsorbed: 800, shieldAfter: 1_700 }), effects).runtime;
    expect(runtime.bulwarkShield).toBe(1_500);
    runtime = hitTaken(runtime, { hpDamage: 0, shieldAbsorbed: 1_000, shieldAfter: 700 });
    expect(runtime.bulwarkShield).toBe(700);
    const broke = endEnemy(hitTaken(runtime, { hpDamage: 300, shieldAbsorbed: 700, shieldAfter: 0 }), effects);
    expect(broke.commands).toEqual([{ kind: "damage_fixed", label: "불괴 방벽 붕괴", amount: 600 }]);
    runtime = broke.runtime;
    expect(bossUniqueDamageTaken(runtime, effects, { damage: 1_000, shield: 0 })).toBe(1_000);
    const rebuilt: number[] = [];
    for (let action = 0; action < 6; action += 1) {
      const done = startBossUniquePlayerAction(runtime, effects, { hp: 5_000, maxHp: MAX_HP, healMult: 1 });
      runtime = done.runtime;
      rebuilt.push(done.commands.length);
    }
    expect(rebuilt).toEqual([0, 0, 0, 0, 0, 1]);
    expect(runtime.bulwarkShield).toBe(1_500);
  });
});

describe("천공의 수정안", () => {
  it("prismatic correction boosts the direct attack after every third direct hit by 25%", () => {
    const effects: UnexploredBossEffectKind[] = ["prismatic_correction"];
    const two = hits(init(...effects), effects, 2).runtime;
    expect(begin(two, effects).damageMult).toBe(1);
    const three = finish(begin(two, effects).runtime, effects, { hit: false }).runtime;
    expect(begin(three, effects).damageMult).toBe(1);
    const ready = hits(two, effects, 1).runtime;
    const boosted = begin(ready, effects);
    expect(boosted.damageMult).toBeCloseTo(1.25);
    expect(boosted.logs).toContain("보정 사격");
    expect(begin(boosted.runtime, effects).damageMult).toBe(1);
  });
  it("starpath aim adds 4%p per non-crit hit up to 20 and resets on crit", () => {
    const effects: UnexploredBossEffectKind[] = ["starpath_aim"];
    let runtime = hits(init(...effects), effects, 6).runtime;
    expect(bossUniqueCritBonusPct(runtime, effects)).toBe(20);
    runtime = hits(runtime, effects, 1, true).runtime;
    expect(bossUniqueCritBonusPct(runtime, effects)).toBe(0);
  });
  it("infinite focus fires a 150% sky barrage with defense breaks at 20 aim", () => {
    const effects: UnexploredBossEffectKind[] = ["infinite_focus"];
    const crits = hits(init(...effects), effects, 9, true);
    expect(crits.commands).toEqual([]);
    expect(crits.runtime.focus).toBe(18);
    const fired = hits(crits.runtime, effects, 2);
    expect(fired.commands).toEqual([
      { kind: "damage_fixed", label: "천공 포격", amount: 1_500 },
      { kind: "def_debuff", label: "천공 포격", pct: 20, actions: 3 },
      { kind: "mdef_debuff", label: "천공 포격", pct: 20, actions: 3 },
    ]);
    expect(fired.runtime.focus).toBe(0);
  });
});

describe("불멸의 광전왕", () => {
  it("immortal frenzy adds 2% per 10% missing HP up to 14%", () => {
    const runtime = init("immortal_frenzy");
    expect(begin(runtime, ["immortal_frenzy"], { hp: 7_000 }).damageMult).toBeCloseTo(1.06);
    expect(begin(runtime, ["immortal_frenzy"], { hp: 100 }).damageMult).toBeCloseTo(1.14);
  });
  it("pulsing regen heals 2% of missing HP each own action, scaled by heal multiplier", () => {
    const done = startBossUniquePlayerAction(init("pulsing_regen"), ["pulsing_regen"], { hp: 5_000, maxHp: MAX_HP, healMult: 0.5 });
    expect(done.commands).toEqual([{ kind: "heal", label: "재생 고동", amount: 50 }]);
  });
  it("eternal saves lethal damage at 35% then 20% max HP in PvE and grants frenzy", () => {
    const effects: UnexploredBossEffectKind[] = ["eternal_life"];
    const runtime = init(...effects);
    expect(bossUniqueLethalSave(runtime, effects, { hpAfterDamage: 1, maxHp: MAX_HP })).toBeNull();
    const first = bossUniqueLethalSave(runtime, effects, { hpAfterDamage: -500, maxHp: MAX_HP })!;
    expect(first.hp).toBe(3_500);
    expect(bossUniqueSelfSpeedMult(first.runtime)).toBeCloseTo(1.15);
    expect(begin(first.runtime, effects).damageMult).toBeCloseTo(1.2);
    const second = bossUniqueLethalSave(first.runtime, effects, { hpAfterDamage: 0, maxHp: MAX_HP })!;
    expect(second.hp).toBe(2_000);
    expect(bossUniqueLethalSave(second.runtime, effects, { hpAfterDamage: 0, maxHp: MAX_HP })).toBeNull();
    expect(bossUniqueLethalSave(init(), [], { hpAfterDamage: 0, maxHp: MAX_HP })).toBeNull();
  });
  it("eternal has one charge in PvP", () => {
    const effects: UnexploredBossEffectKind[] = ["eternal_life"];
    const pvp = initialBossUniqueRuntime(effects, { maxHp: MAX_HP, pvp: true }).runtime;
    const first = bossUniqueLethalSave(pvp, effects, { hpAfterDamage: 0, maxHp: MAX_HP })!;
    expect(first.hp).toBe(3_500);
    expect(bossUniqueLethalSave(first.runtime, effects, { hpAfterDamage: 0, maxHp: MAX_HP })).toBeNull();
  });
});

describe("resource snapshot", () => {
  it("shows only active counters", () => {
    expect(bossUniqueResourceSnapshot(init())).toBeUndefined();
    const runtime = hits(init("infinite_orbit", "glacial_crush"), ["infinite_orbit", "glacial_crush"], 3).runtime;
    expect(bossUniqueResourceSnapshot(runtime)).toEqual({
      unexploredBossPursuit: "추적 3/10",
      unexploredBossChill: "혹한 3/10",
    });
  });
});
