import { describe, expect, it } from "vitest";
import { resolveV2SkillCast } from "./combatShared";

type SkillId =
  | "v2c_skyascendant_fallingstar"
  | "v2c_skyascendant_voidbreak"
  | "v2c_celestialdragon_combo"
  | "v2c_heavenlybow_orbit";

function cast(
  skillId: SkillId,
  combatMode: "pve" | "pvp",
  { def = 0, procRoll = 0, atk = 100, stat = 100 } = {},
) {
  return resolveV2SkillCast({
    skills: { learned: [skillId], equipped: [skillId] },
    cooldowns: {},
    procRoll,
    combatMode,
    attacker: {
      mp: 119,
      atk,
      dex: stat,
      str: stat,
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
    expect(normal.enemyDamage).toBeGreaterThan(
      cast("v2c_heavenlybow_orbit", mode).enemyDamage,
    );
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
    // 교차가 힘 대신 민첩을 사용하는 상황도 두 능력치가 같으면 동일하다.
    expect(result.enemyDamage).toBeGreaterThan(
      cast("v2c_celestialdragon_combo", mode).enemyDamage,
    );
    expect(result.nextMp).toBe(0);
  });

  it.each([
    { atk: 1_000, stat: 300 },
    { atk: 300, stat: 1_000 },
  ])("파공이 장비·능력치 성장 표본에서도 천룡난무보다 강하다 (%j)", (stats) => {
    expect(cast("v2c_skyascendant_voidbreak", mode, stats).enemyDamage)
      .toBeGreaterThan(cast("v2c_celestialdragon_combo", mode, stats).enemyDamage);
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
