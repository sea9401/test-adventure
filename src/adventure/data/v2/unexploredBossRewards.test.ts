import { describe, expect, it, vi } from "vitest";
import { UNEXPLORED_BOSSES } from "./unexploredBosses";
import {
  rollUnexploredBossReward,
  rollUnexploredBossUniques,
} from "./unexploredBossRewards";

function sequence(values: number[]) {
  let index = 0;
  return vi.fn(() => values[index++] ?? 0.999);
}

describe("unexploredBossRewards", () => {
  it("30%·10%·0.5%를 서로 다른 RNG 호출로 모두 굴린다", () => {
    const successRng = sequence([0.29, 0.09, 0.004]);
    expect(rollUnexploredBossUniques("tracking_weapon", successRng)).toEqual(
      UNEXPLORED_BOSSES.tracking_weapon.uniqueDrops.map(
        (drop) => drop.equipmentId,
      ),
    );
    expect(successRng).toHaveBeenCalledTimes(3);

    const failRng = sequence([0.31, 0.11, 0.006]);
    expect(rollUnexploredBossUniques("tracking_weapon", failRng)).toEqual([]);
    expect(failRng).toHaveBeenCalledTimes(3);
  });

  it("불멸의 광전왕 전용 장비 3종도 30%·10%·0.5% 독립 굴림을 유지한다", () => {
    const rng = sequence([0.29, 0.09, 0.004]);

    expect(rollUnexploredBossUniques("immortal_berserker", rng)).toEqual(
      UNEXPLORED_BOSSES.immortal_berserker.uniqueDrops.map(
        (drop) => drop.equipmentId,
      ),
    );
    expect(rng).toHaveBeenCalledTimes(3);
  });

  it("앞 고유의 성공 여부가 초희귀 RNG 호출과 결과를 바꾸지 않는다", () => {
    const withCommons = sequence([0, 0, 0.004]);
    const withoutCommons = sequence([0.99, 0.99, 0.004]);
    const rareId =
      UNEXPLORED_BOSSES.toxic_blood_lord.uniqueDrops[2].equipmentId;
    expect(
      rollUnexploredBossUniques("toxic_blood_lord", withCommons),
    ).toContain(rareId);
    expect(
      rollUnexploredBossUniques("toxic_blood_lord", withoutCommons),
    ).toEqual([rareId]);
    expect(withCommons).toHaveBeenCalledTimes(3);
    expect(withoutCommons).toHaveBeenCalledTimes(3);
  });

  it("핵 1개와 연결 풀 재료 중 하나를 확정하고 골드는 주지 않는다", () => {
    const first = rollUnexploredBossReward(
      "glacial_colossus",
      sequence([0.99, 0.99, 0.99]),
      () => 0,
    );
    const second = rollUnexploredBossReward(
      "glacial_colossus",
      sequence([0.99, 0.99, 0.99]),
      () => 0.999,
    );
    expect(first).toMatchObject({
      bossCore: 1,
      poolMaterialCount: 1,
      uniqueIds: [],
    });
    expect(second).toMatchObject({
      bossCore: 1,
      poolMaterialCount: 1,
      uniqueIds: [],
    });
    expect(first.poolMaterialId).not.toBe(second.poolMaterialId);
    expect(first).not.toHaveProperty("gold");
  });
});
