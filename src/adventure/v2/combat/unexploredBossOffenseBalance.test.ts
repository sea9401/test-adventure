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
  it("물리 유리 대포를 위협하되 물리 방어 투자로 피해를 절반 이하로 줄인다", () => {
    const attack = fullHpAttack("tracking_weapon");
    const glassDamage = damageToDefender(attack, 200);
    const defensiveDamage = damageToDefender(attack, 1_500);

    expect(glassDamage / REFERENCE_HP).toBeGreaterThanOrEqual(0.5);
    expect(glassDamage / REFERENCE_HP).toBeLessThanOrEqual(0.8);
    expect(defensiveDamage).toBeLessThanOrEqual(glassDamage * 0.5);
  });

  it("마법 유리 대포를 위협하되 마법 방어 투자에 생존 차이를 준다", () => {
    const attack = fullHpAttack("skyward_crystal_eye");
    const glassDamage = damageToMagicDefender(attack, 400);
    const defensiveDamage = damageToMagicDefender(attack, 1_200);

    expect(glassDamage / REFERENCE_HP).toBeGreaterThanOrEqual(0.5);
    expect(glassDamage / REFERENCE_HP).toBeLessThanOrEqual(0.75);
    expect(defensiveDamage).toBeLessThanOrEqual(
      Math.ceil(glassDamage * 0.75),
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
