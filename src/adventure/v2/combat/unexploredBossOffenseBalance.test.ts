import { describe, expect, it } from "vitest";

import { COOP_BOSSES, coopBossForBattle } from "@/adventure/data/v2/coopBosses";
import { damageToDefender, damageToMagicDefender } from "./combatShared";

const REFERENCE_HP = 10_000;

function fullHpAttack(
  bossId:
    | "tracking_weapon"
    | "toxic_blood_lord"
    | "glacial_colossus"
    | "invincible_fortress"
    | "skyward_crystal_eye"
    | "immortal_berserker",
): number {
  const boss = COOP_BOSSES[bossId];
  return coopBossForBattle(boss, boss.sharedMaxHp).monster.atk;
}

describe("미개척지 보스 기본 공격 체급", () => {
  it("모든 개인 보스의 주요 전투 스탯을 기존 기준보다 30% 강화한다", () => {
    const expected = {
      tracking_weapon: {
        sharedMaxHp: 19_500_000,
        atk: 11_154,
        def: 2_370,
        magicDef: 2_145,
        spd: 68,
        accuracy: 759.7165504712136,
        evasionPct: 15.6,
      },
      toxic_blood_lord: {
        sharedMaxHp: 23_400_000,
        atk: 1_429,
        def: 2_483,
        magicDef: 2_596,
        spd: 68,
        accuracy: 772.7165504712136,
        evasionPct: 15.6,
      },
      glacial_colossus: {
        sharedMaxHp: 42_120_000,
        atk: 2_789,
        def: 2_709,
        magicDef: 2_935,
        spd: 25,
        accuracy: 779.2165504712136,
        evasionPct: 10.4,
      },
      invincible_fortress: {
        sharedMaxHp: 42_120_000,
        atk: 4_323,
        def: 2_822,
        magicDef: 2_822,
        spd: 26,
        accuracy: 779.2165504712136,
        evasionPct: 10.4,
      },
      skyward_crystal_eye: {
        sharedMaxHp: 42_120_000,
        atk: 7_808,
        def: 2_370,
        magicDef: 2_709,
        spd: 74,
        accuracy: 805.2165504712136,
        evasionPct: 20.8,
      },
      immortal_berserker: {
        sharedMaxHp: 42_120_000,
        atk: 10_457,
        def: 2_370,
        magicDef: 2_145,
        spd: 68,
        accuracy: 779.2165504712136,
        evasionPct: 13,
      },
    } as const;

    for (const [bossId, stats] of Object.entries(expected)) {
      const boss = COOP_BOSSES[bossId as keyof typeof expected];
      const monster = coopBossForBattle(boss, boss.sharedMaxHp).monster;

      expect(boss.sharedMaxHp, bossId).toBe(stats.sharedMaxHp);
      expect(monster, bossId).toMatchObject({
        hp: stats.sharedMaxHp,
        atk: stats.atk,
        def: stats.def,
        magicDef: stats.magicDef,
        spd: stats.spd,
        evasionPct: stats.evasionPct,
      });
      expect(monster.accuracy, bossId).toBeCloseTo(stats.accuracy, 10);
    }
  });

  it("물리 유리 대포를 위협하되 물리 방어 투자로 피해를 절반 이하로 줄인다", () => {
    const attack = fullHpAttack("tracking_weapon");
    const glassDamage = damageToDefender(attack, 200);
    const defensiveDamage = damageToDefender(attack, 1_500);

    expect(glassDamage / REFERENCE_HP).toBeGreaterThanOrEqual(0.75);
    expect(glassDamage / REFERENCE_HP).toBeLessThanOrEqual(0.9);
    expect(defensiveDamage).toBeLessThanOrEqual(glassDamage * 0.5);
  });

  it("마법 유리 대포를 위협하되 마법 방어 투자에 생존 차이를 준다", () => {
    const attack = fullHpAttack("skyward_crystal_eye");
    const glassDamage = damageToMagicDefender(attack, 400);
    const defensiveDamage = damageToMagicDefender(attack, 1_200);

    expect(glassDamage / REFERENCE_HP).toBeGreaterThanOrEqual(0.6);
    expect(glassDamage / REFERENCE_HP).toBeLessThanOrEqual(0.75);
    expect(defensiveDamage).toBeLessThanOrEqual(
      Math.ceil(glassDamage * 0.8),
    );
  });

  it("기믹 자체가 치명적인 독혈 군주는 다른 보스보다 낮은 평타 체급을 유지한다", () => {
    const toxicAttack = fullHpAttack("toxic_blood_lord");
    const otherAttacks = [
      fullHpAttack("tracking_weapon"),
      fullHpAttack("glacial_colossus"),
      fullHpAttack("invincible_fortress"),
      fullHpAttack("skyward_crystal_eye"),
      fullHpAttack("immortal_berserker"),
    ];

    expect(toxicAttack).toBeLessThan(Math.min(...otherAttacks));
  });
});
