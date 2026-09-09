import { describe, expect, it } from "vitest";
import { enemiesForDepth } from "./dungeon";
import { UNEXPLORED_SPECIALTY_EQUIPMENT_IDS } from "./unexploredSpecialtyEquipment";
import {
  UNEXPLORED_SPECIALTY_POOLS,
  parseUnexploredHuntMode,
  pickUnexploredSpecialtyEncounter,
} from "./unexploredSpecialtyPools";

describe("unexplored specialty pools", () => {
  it("12개 풀에 몬스터와 전용 장비가 정확히 3개씩 있다", () => {
    expect(UNEXPLORED_SPECIALTY_POOLS).toHaveLength(12);
    const monsters = UNEXPLORED_SPECIALTY_POOLS.flatMap((pool) => pool.monsters);
    expect(monsters).toHaveLength(36);
    expect(new Set(monsters.map((monster) => monster.id)).size).toBe(36);
    expect(new Set(monsters.map((monster) => monster.equipmentId))).toEqual(
      new Set(UNEXPLORED_SPECIALTY_EQUIPMENT_IDS),
    );
  });

  it("random은 전체 풀을, focused는 지정 풀만 사용한다", () => {
    expect(pickUnexploredSpecialtyEncounter({ mode: "random" }, () => 0)?.poolId)
      .toBe("iron_legion");
    expect(pickUnexploredSpecialtyEncounter(
      { mode: "focused", poolId: "venom_colony" },
      () => 0.999,
    )?.poolId).toBe("venom_colony");
  });

  it("standard와 유효하지 않은 저장 모드는 기본 사냥으로 정규화한다", () => {
    expect(pickUnexploredSpecialtyEncounter({ mode: "standard" }, () => 0))
      .toBeNull();
    expect(parseUnexploredHuntMode({ mode: "focused", poolId: "missing" }))
      .toEqual({ mode: "standard" });
    expect(parseUnexploredHuntMode("random")).toEqual({ mode: "standard" });
  });

  it("특화 조우는 재사용한 원본 몬스터의 전투 메타데이터를 보존한다", () => {
    const baseEnemies = new Map(
      [...enemiesForDepth(73), ...enemiesForDepth(79)].map((enemy) => [
        enemy.key,
        enemy,
      ]),
    );

    for (const pool of UNEXPLORED_SPECIALTY_POOLS) {
      for (let index = 0; index < pool.monsters.length; index += 1) {
        const monster = pool.monsters[index];
        const encounter = pickUnexploredSpecialtyEncounter(
          { mode: "focused", poolId: pool.id },
          () => (index + 0.1) / pool.monsters.length,
        )!;
        const base = baseEnemies.get(monster.baseMonsterKey)!;

        expect(encounter.enemy.key).toBe(base.key);
        expect(encounter.enemy.element).toBe(base.element);
        expect(encounter.enemy.statusSkill).toBe(base.statusSkill);
        expect(encounter.enemy.castSkill).toBe(base.castSkill);
      }
    }
  });
});
