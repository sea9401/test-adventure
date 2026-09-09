import { afterEach, describe, expect, it, vi } from "vitest";
import type { Monster } from "@/adventure/data/monsters";
import type { SignatureEffect } from "@/adventure/data/v2/v2Equipment";
import type { V2SkillId, V2SkillsState } from "@/adventure/data/v2/v2Skills";
import { applyV2DotsToTarget, tickV2Dots, type V2Dot } from "./combatShared";
import { applyPlayerV2SkillCast, initialBattleState, type PlayerCombat } from "./engine";
import { castV2SkillOnAttackerTurnPvP, initialBattleStatePvP, applyPvPOnHitDots } from "./engine-pvp";
import { applyPlayerOnHitDots } from "./engine";
import { applyTier6UniquePveEvent } from "./tier6UniquePveAdapter";
import { applyTier6UniquePvpEvent } from "./tier6UniquePvpAdapter";
import type { Tier6UniqueEvent } from "./tier6UniqueEffects";
import { resolvePlayerPhase } from "./engine.playerPhase";
import { advanceTurnPvP } from "./engine.pvpPhase";
import { healingReductionPct } from "./burnHealing";

afterEach(() => vi.restoreAllMocks());

const strong: V2Dot = {
  tag: "poison", label: "중독", stacks: 6, maxStacks: 10, turns: 5,
  flatPerStack: 30, atkCoefPerStack: 0, pctMaxHpPerStack: 0.005, sourceAtk: 3000,
};
const weak: V2Dot = { ...strong, stacks: 1, turns: 3, flatPerStack: 0, sourceAtk: 1000 };

describe("독 병합 피해 보존", () => {
  it.each([[strong, weak], [weak, strong]])("부여 순서와 무관하게 강한 독과 긴 지속을 보존한다", (first, second) => {
    const dots = applyV2DotsToTarget([first], [second], 100_000_000, 0.5);
    expect(dots).toEqual([{ ...strong, stacks: 7 }]);
    expect(tickV2Dots(dots, 100_000_000, 0.5).totalDmg).toBe(9660);
  });

  it("중첩 상한에서도 피해와 지속을 낮추지 않고 입력을 변형하지 않는다", () => {
    const full = { ...strong, stacks: 10 };
    expect(applyV2DotsToTarget([full], [weak], 100_000_000)).toEqual([full]);
    expect(full.turns).toBe(5);
    expect(weak.stacks).toBe(1);
  });

  it("만료된 독의 위력·지속·중첩을 되살리지 않는다", () => {
    expect(applyV2DotsToTarget([{ ...strong, turns: 0 }], [weak], 100_000_000)).toEqual([weak]);
  });

  it.each([
    [1000, 1, 100],
    [1_000_000, 1, 1800],
    [1_000_000, 0.01, 100],
  ])("대상 HP %i, HP 비례 보정 %f에서 실제 피해로 비교한다", (hp, mult, expected) => {
    const flat = { ...weak, stacks: 1, flatPerStack: 50, pctMaxHpPerStack: 0 };
    const percent = { ...weak, stacks: 1, flatPerStack: 0, pctMaxHpPerStack: 0.01 };
    const dots = applyV2DotsToTarget([flat], [percent], hp, mult);
    expect(tickV2Dots(dots, hp, mult).totalDmg).toBe(expected);
  });

  it.each(["bleed", "burn"] as const)("%s 병합은 기존 최신 독 계산값 정책을 유지한다", tag => {
    expect(applyV2DotsToTarget([{ ...strong, tag }], [{ ...weak, tag }])).toEqual([{ ...weak, tag, stacks: 7 }]);
  });

  it("상한 뒤 최종 배율까지 비교하고 서로 다른 독의 계수를 합성하지 않는다", () => {
    const amplified = { ...weak, finalDamageMult: 4 };
    const dots = applyV2DotsToTarget([amplified], [strong], 100_000_000);
    expect(dots).toEqual([{ ...amplified, stacks: 7, turns: 5 }]);
    expect(tickV2Dots(dots, 100_000_000).totalDmg).toBe(25200);
  });
});

const boss: Monster = { name: "검증 보스", hp: 100_000_000, atk: 1, def: 0, spd: 1, exp: 0, drops: [], tags: [] };
const player: PlayerCombat = {
  hp: 10000, maxHp: 10000, mp: 10000, maxMp: 10000, atk: 1000, lukStat: 3000,
  def: 0, spd: 100, evasionPct: 0, attackCount: 1, critChancePct: 0, poisonDamagePct: 122.4,
};
const skills: V2SkillsState = {
  learned: ["v2c_myriadvenom_mutation"], equipped: ["v2c_myriadvenom_mutation"],
  pattern: { blocks: [{ condition: { kind: "always" }, action: { kind: "skill", skillId: "v2c_myriadvenom_mutation" } }] },
};
const venom: SignatureEffect = { trigger: "tier6_unique", mechanic: "venom_burst", label: "양면침" };
const balance: SignatureEffect = { trigger: "tier6_unique", mechanic: "venom_balance", label: "부식 환류" };
const event: Tier6UniqueEvent = {
  kind: "direct_hit", damage: 100, crit: false, attackKind: "skill", paidMp: 58,
  statusKinds: 1, bleedStacks: 0, bleedRemainingDamage: 0, poisonStacks: 6,
  poisonRemainingDamage: 1000, magicAtk: 1000, maxHp: 10000,
  origin: { actionId: 1, eventId: 1 },
};

const skillDotCases = [
  ["v2c_rogue_poison", "poison"],
  ["v2c_beastkin_rend", "bleed"],
  ["v2c_mage_fireball", "burn"],
] as const satisfies ReadonlyArray<readonly [V2SkillId, V2Dot["tag"]]>;

function castStatusSkill(
  skillId: V2SkillId,
  statusDotDamagePct: number,
  mode: "pve" | "p1" | "p2",
) {
  vi.spyOn(Math, "random").mockReturnValue(0);
  const actor: PlayerCombat = {
    ...player,
    poisonDamagePct: 0,
    burnDamagePct: 0,
    statusDotDamagePct,
    magicAtk: 1000,
    intStat: 1000,
    classTier: 4,
  };
  const skillState: V2SkillsState = {
    learned: [skillId],
    equipped: [skillId],
  };
  if (mode === "pve") {
    const state = initialBattleState(actor, boss, "공격", skillState);
    const result = applyPlayerV2SkillCast(
      state,
      actor,
      { selfBuffs: {}, selfDebuffs: {}, enemyDebuffs: {} },
    ).state;
    return { dots: result.enemyV2Dots, targetHp: result.enemyHp };
  }
  const target = { ...player, hp: boss.hp, maxHp: boss.hp, spd: 1 };
  const initial = initialBattleStatePvP(
    mode === "p1" ? actor : target,
    mode === "p2" ? actor : target,
    "P1",
    "P2",
    mode === "p1" ? skillState : undefined,
    mode === "p2" ? skillState : undefined,
    undefined,
    undefined,
    mode,
  );
  const result = castV2SkillOnAttackerTurnPvP(initial, mode).state;
  const defender = mode === "p1" ? result.p2 : result.p1;
  return { dots: defender.v2Dots, targetHp: defender.hp };
}

function basicEquipmentDots(
  statusDotDamagePct: number,
  mode: "pve" | "p1" | "p2",
  randomRoll = 0,
) {
  vi.spyOn(Math, "random").mockReturnValue(randomRoll);
  const actor: PlayerCombat = {
    ...player,
    poisonDamagePct: 0,
    statusDotDamagePct,
    equipSignatures: [
      {
        trigger: "on_hit",
        label: "장비 중독",
        poisonChancePct: 50,
        poisonStacks: 1,
      },
      {
        trigger: "on_hit",
        label: "장비 출혈",
        bleedChancePct: 50,
        bleedStacks: 1,
      },
    ],
  };
  if (mode === "pve") {
    const result = resolvePlayerPhase(
      initialBattleState(actor, boss, "공격"),
      actor,
      "공격",
      { kind: "attack" },
    );
    return { dots: result.enemyV2Dots, targetHp: result.enemyHp };
  }
  const target = { ...player, hp: boss.hp, maxHp: boss.hp, spd: 1 };
  const initial = initialBattleStatePvP(
    mode === "p1" ? actor : target,
    mode === "p2" ? actor : target,
    "P1",
    "P2",
    undefined,
    undefined,
    undefined,
    undefined,
    mode,
  );
  const result = advanceTurnPvP(initial, { kind: "attack" }, { tickDefenderDots: false });
  const defender = mode === "p1" ? result.p2 : result.p1;
  return { dots: defender.v2Dots, targetHp: defender.hp };
}

describe("상태 지속 피해 장비 옵션 실제 엔진 전달", () => {
  it.each(skillDotCases)("PvE %s의 %s 주기 피해만 정확히 한 번 증폭한다", (skillId, tag) => {
    const plain = castStatusSkill(skillId, 0, "pve");
    vi.restoreAllMocks();
    const boosted = castStatusSkill(skillId, 40, "pve");
    const plainDot = plain.dots.find((dot) => dot.tag === tag)!;
    const boostedDot = boosted.dots.find((dot) => dot.tag === tag)!;

    expect(boostedDot.periodicDamageMult).toBe(1.4);
    expect(tickV2Dots([boostedDot], boss.hp).totalDmg).toBeGreaterThan(
      tickV2Dots([plainDot], boss.hp).totalDmg,
    );
    expect(boosted.targetHp).toBe(plain.targetHp);
    expect(boostedDot).toMatchObject({
      tag: plainDot.tag,
      stacks: plainDot.stacks,
      maxStacks: plainDot.maxStacks,
      turns: plainDot.turns,
    });
    expect(healingReductionPct([boostedDot])).toBe(
      healingReductionPct([plainDot]),
    );
  });

  it.each(["p1", "p2"] as const)("PvP %s 스킬 중독·출혈·연소를 대칭 적용한다", (side) => {
    for (const [skillId, tag] of skillDotCases) {
      const plain = castStatusSkill(skillId, 0, side);
      vi.restoreAllMocks();
      const boosted = castStatusSkill(skillId, 40, side);
      const plainDot = plain.dots.find((dot) => dot.tag === tag)!;
      const boostedDot = boosted.dots.find((dot) => dot.tag === tag)!;

      expect(boostedDot.periodicDamageMult).toBe(1.4);
      expect(tickV2Dots([boostedDot], boss.hp).totalDmg).toBeGreaterThan(
        tickV2Dots([plainDot], boss.hp).totalDmg,
      );
      expect(boosted.targetHp).toBe(plain.targetHp);
      expect(boostedDot.stacks).toBe(plainDot.stacks);
      expect(boostedDot.turns).toBe(plainDot.turns);
      expect(healingReductionPct([boostedDot])).toBe(
        healingReductionPct([plainDot]),
      );
      vi.restoreAllMocks();
    }
  });

  it.each(["pve", "p1", "p2"] as const)("%s 평타 장비 중독·출혈의 부여와 직접 피해는 그대로 둔다", (mode) => {
    const plain = basicEquipmentDots(0, mode);
    vi.restoreAllMocks();
    const boosted = basicEquipmentDots(40, mode);

    expect(boosted.targetHp).toBe(plain.targetHp);
    expect(boosted.dots.map((dot) => [dot.tag, dot.stacks, dot.turns])).toEqual(
      plain.dots.map((dot) => [dot.tag, dot.stacks, dot.turns]),
    );
    for (const tag of ["poison", "bleed"] as const) {
      const baseDamage = tickV2Dots(
        [plain.dots.find((dot) => dot.tag === tag)!],
        boss.hp,
      ).totalDmg;
      const boostedDamage = tickV2Dots(
        [boosted.dots.find((dot) => dot.tag === tag)!],
        boss.hp,
      ).totalDmg;
      expect(boosted.dots.find((dot) => dot.tag === tag)?.periodicDamageMult).toBe(1.4);
      expect(boostedDamage).toBeGreaterThan(baseDamage);
    }
  });

  it.each(["pve", "p1", "p2"] as const)("%s 평타 장비 DOT의 실패 확률은 지속 피해 증폭과 무관하다", (mode) => {
    const plain = basicEquipmentDots(0, mode, 0.75);
    vi.restoreAllMocks();
    const boosted = basicEquipmentDots(40, mode, 0.75);

    expect(plain.dots).toEqual([]);
    expect(boosted.dots).toEqual([]);
    expect(boosted.targetHp).toBe(plain.targetHp);
  });
});

function cast(signatures: SignatureEffect[], pvp: boolean) {
  vi.spyOn(Math, "random").mockReturnValue(0);
  const actor = { ...player, equipSignatures: signatures };
  if (pvp) {
    const state = initialBattleStatePvP(actor, { ...player, hp: boss.hp, maxHp: boss.hp }, "독술사", "상대");
    state.p1.v2Skills = skills;
    return castV2SkillOnAttackerTurnPvP(state, "p1").state.p2.v2Dots;
  }
  const state = initialBattleState(actor, boss, "독술사", skills);
  return applyPlayerV2SkillCast({ ...state, isBoss: true, maxHpDamageMult: 0.5 }, actor,
    { selfBuffs: {}, selfDebuffs: {}, enemyDebuffs: {} }).state.enemyV2Dots;
}

describe.each([false, true])("장비 독 연동 PvP=%s", pvp => {
  it.each([false, true])("기본 공격 장비 독에도 행운·독 강화 보정을 적용한다 (치명타=%s)", critical => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const actor: PlayerCombat = {
      ...player, critChancePct: critical ? 100 : 0, poisonDamagePct: 0,
      equipSignatures: [critical
        ? { trigger: "on_crit", label: "독니", poisonOnCrit: true }
        : { trigger: "on_hit", label: "만독", poisonChancePct: 100, poisonStacks: 1 }],
    };
    const dots = pvp
      ? advanceTurnPvP(initialBattleStatePvP(actor, { ...player, hp: boss.hp, maxHp: boss.hp, spd: 1 }, "공격", "방어")).p2.v2Dots
      : resolvePlayerPhase(initialBattleState(actor, boss, "독술사"), actor, "공격", { kind: "attack" }).enemyV2Dots;
    expect(dots[0].stacks).toBe(1);
    expect(tickV2Dots(dots, boss.hp).totalDmg).toBe(1214);
  });
  it.each([
    [venom],
    [{ trigger: "on_hit", label: "만독", poisonChancePct: 100, poisonStacks: 1 }],
    [{ trigger: "direct_skill_hit", label: "재앙독", poisonChancePct: 100, poisonStacks: 1 }],
  ] as SignatureEffect[][])("장비 추가 독이 만독개화를 약화시키지 않는다: %j", signature => {
    const baseline = cast([], pvp)[0];
    const after = cast([signature], pvp)[0];
    expect(after.stacks).toBe(7);
    expect(after.turns).toBeGreaterThanOrEqual(baseline.turns);
    expect(after.sourceAtk).toBe(3000);
    expect(tickV2Dots([after], boss.hp, 0.5).totalDmg).toBeGreaterThanOrEqual(
      tickV2Dots([baseline], boss.hp, 0.5).totalDmg,
    );
  });

  it.each([[0, 1214], [122.4, 2700]])("장비 단독 중독에 행운과 독 강화 %f를 한 번 적용한다", (poisonDamagePct, expected) => {
    const actor = { ...player, poisonDamagePct, poisonOnHit: { pctMaxHpPerStack: 0.004 } };
    const state = initialBattleStatePvP(actor, { ...player, hp: boss.hp, maxHp: boss.hp }, "공격", "방어");
    const dots = pvp
      ? applyPvPOnHitDots(state.p2, state.p1).v2Dots
      : applyPlayerOnHitDots(initialBattleState(actor, boss, "독술사"), actor).enemyV2Dots;
    expect(tickV2Dots(dots, boss.hp).totalDmg).toBe(expected);
  });

  it.each([[0, 1214], [122.4, 2700]])("양면침 주입과 폭발 잔독에도 독 강화 %f를 적용한다", (poisonDamagePct, expected) => {
    const actor = { ...player, poisonDamagePct, equipSignatures: [venom, balance] };
    if (pvp) {
      const state = initialBattleStatePvP(actor, { ...player, hp: boss.hp, maxHp: boss.hp }, "공격", "방어");
      const injected = applyTier6UniquePvpEvent(state, "p1", "p2", event);
      expect(tickV2Dots(injected.p2.v2Dots, boss.hp).totalDmg).toBe(expected);
      const after = applyTier6UniquePvpEvent(injected, "p1", "p2", { ...event, attackKind: "basic", origin: { actionId: 2, eventId: 2 } });
      expect(after.p2.v2Dots[0].stacks).toBe(3);
      expect(tickV2Dots(after.p2.v2Dots, boss.hp).totalDmg).toBe(poisonDamagePct === 0 ? 3642 : 8100);
      expect(after.p2.hp).toBeLessThan(injected.p2.hp);
    } else {
      const state = initialBattleState(actor, boss, "독술사");
      const injected = applyTier6UniquePveEvent(state, actor, event);
      expect(tickV2Dots(injected.enemyV2Dots, boss.hp).totalDmg).toBe(expected);
      const after = applyTier6UniquePveEvent(injected, actor, { ...event, attackKind: "basic", origin: { actionId: 2, eventId: 2 } });
      expect(after.enemyV2Dots[0].stacks).toBe(3);
      expect(tickV2Dots(after.enemyV2Dots, boss.hp).totalDmg).toBe(poisonDamagePct === 0 ? 3642 : 8100);
      expect(after.enemyHp).toBeLessThan(injected.enemyHp);
    }
  });

  it("통합 지속 피해 증폭은 양면침 폭발 즉발 피해를 바꾸지 않는다", () => {
    const run = (statusDotDamagePct: number) => {
      const actor = {
        ...player,
        poisonDamagePct: 0,
        statusDotDamagePct,
        equipSignatures: [venom, balance],
      };
      if (pvp) {
        const initial = initialBattleStatePvP(
          actor,
          { ...player, hp: boss.hp, maxHp: boss.hp },
          "공격",
          "방어",
        );
        const injected = applyTier6UniquePvpEvent(initial, "p1", "p2", event);
        return applyTier6UniquePvpEvent(injected, "p1", "p2", {
          ...event,
          attackKind: "basic",
          origin: { actionId: 2, eventId: 2 },
        });
      }
      const initial = initialBattleState(actor, boss, "공격");
      const injected = applyTier6UniquePveEvent(initial, actor, event);
      return applyTier6UniquePveEvent(injected, actor, {
        ...event,
        attackKind: "basic",
        origin: { actionId: 2, eventId: 2 },
      });
    };
    const plain = run(0);
    const boosted = run(40);
    const targetSnapshot = (result: ReturnType<typeof run>) =>
      "p2" in result
        ? { hp: result.p2.hp, dots: result.p2.v2Dots }
        : { hp: result.enemyHp, dots: result.enemyV2Dots };
    const plainTarget = targetSnapshot(plain);
    const boostedTarget = targetSnapshot(boosted);

    expect(boostedTarget.hp).toBe(plainTarget.hp);
    expect(tickV2Dots(boostedTarget.dots, boss.hp).totalDmg).toBeGreaterThan(
      tickV2Dots(plainTarget.dots, boss.hp).totalDmg,
    );
  });
});
