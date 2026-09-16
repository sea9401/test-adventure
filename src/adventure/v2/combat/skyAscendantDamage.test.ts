import { describe, expect, it } from "vitest";
import { resolveV2SkillCast } from "./combatShared";

type SkillId =
  | "v2c_skyascendant_fallingstar"
  | "v2c_skyascendant_voidbreak";

function cast(
  skillId: SkillId,
  combatMode: "pve" | "pvp",
  { def = 0, procRoll = 0 } = {},
) {
  return resolveV2SkillCast({
    skills: { learned: [skillId], equipped: [skillId] },
    cooldowns: {},
    procRoll,
    combatMode,
    attacker: {
      mp: 119,
      atk: 100,
      dex: 100,
      maxHp: 1_000,
      currentHp: 1_000,
      selfBuffs: {},
      selfDebuffs: {},
    },
    target: {
      def,
      maxHp: 100_000,
      currentHp: 100_000,
      selfBuffs: {},
      selfDebuffs: {},
    },
  });
}

describe.each(["pve", "pvp"] as const)("비천무신 액티브 역할 (%s)", (mode) => {
  it("낙성은 단일 관통 공격으로 높은 방어에도 피해를 남긴다", () => {
    const normal = cast("v2c_skyascendant_fallingstar", mode);
    const armored = cast("v2c_skyascendant_fallingstar", mode, { def: 10_000 });
    expect(normal.hitDamages).toHaveLength(1);
    expect(armored.enemyDamage).toBeGreaterThanOrEqual(119);
    // 최초 수정 전 공격력 100·민첩 100·방어 0 기준 443 피해.
    // 관통·발동률 보완 직후의 460 피해에서 기본 계수도 소폭 보완한다.
    expect(normal.enemyDamage).toBeGreaterThan(460);
    expect(normal.enemyDamage).toBeLessThanOrEqual(443 * 1.2);
    expect(normal.nextMp).toBe(0);
  });

  it("파공은 앞선 세 타격보다 강한 막타와 자체 행동 지연을 제공한다", () => {
    const result = cast("v2c_skyascendant_voidbreak", mode);
    expect(result.hitDamages).toHaveLength(4);
    const [first, second, third, last] = result.hitDamages;
    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(last).toBeGreaterThan(first * 1.8);
    expect(result.enemyDelayToApply).toEqual({ pct: 10 });
    // 최초 수정 전 같은 표본의 335 피해보다 소폭 강화한다.
    expect(result.enemyDamage).toBeGreaterThan(357);
    expect(result.enemyDamage).toBeLessThanOrEqual(335 * 1.2);
    expect(result.nextMp).toBe(0);
  });

  it.each([
    "v2c_skyascendant_fallingstar",
    "v2c_skyascendant_voidbreak",
  ] as const)("%s는 발동률 60퍼센트 경계를 지키고 실패하면 MP를 쓰지 않는다", (skillId) => {
    expect(cast(skillId, mode, { procRoll: 59.99 }).castSkillId).toBe(skillId);
    const failed = cast(skillId, mode, { procRoll: 60 });
    expect(failed.castSkillId).toBeNull();
    expect(failed.nextMp).toBe(119);
  });
});
