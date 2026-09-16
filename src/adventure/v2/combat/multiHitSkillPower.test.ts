import { describe, expect, it } from "vitest";
import { resolveV2SkillCast } from "./combatShared";

// 총계수 전환 전 결과. 공격력/마공/주스탯 100, 방어 0, 패턴 배율 없는 직접 시전.
const BEFORE = [
  ["v2c_beastkin_clawflurry", 3, 42],
  ["v2c_warrior_flurry", 3, 42],
  ["v2c_martial_combo", 5, 24],
  ["v2c_mage_barrage", 3, 36],
  ["v2c_boxer_combo", 4, 44],
  ["v2c_brawler_combo", 3, 75],
  ["v2c_ranger_ambush", 3, 51],
  ["v2c_warmonk_kick", 4, 65],
  ["v2c_sensei_combo", 3, 75],
  ["v2c_celestialdragon_combo", 5, 143],
  ["v2c_shadowblade_traceless", 5, 75],
] as const;

describe.each(["pve", "pvp"] as const)("%s 연타 총계수 전환의 위력 보존", (combatMode) => {
  it.each(BEFORE)("%s의 타격별 피해와 총피해를 보존한다", (id, count, damage) => {
    const result = resolveV2SkillCast({
      skills: { learned: [id], equipped: [id] }, cooldowns: {}, procRoll: 0, combatMode,
      attacker: {
        mp: 10000, atk: 100, magicAtk: 100, str: 100, int: 100, dex: 100, vit: 100, luk: 100,
        maxHp: 1000, currentHp: 1000, selfBuffs: {}, selfDebuffs: {},
      },
      target: { def: 0, magicDef: 0, maxHp: 10000, currentHp: 10000, selfBuffs: {}, selfDebuffs: {} },
    });
    expect(result.hitDamages).toEqual(Array(count).fill(damage));
    expect(result.enemyDamage).toBe(count * damage);
  });
});
