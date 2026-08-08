import { describe, expect, it } from "vitest";
import {
  applyUniqueEquipmentAcquisitions,
  persistedUniqueEquipmentAcquired,
  uniqueEquipmentAcquisitionProgress,
} from "./uniqueEquipmentAchievement";

const unique = (iid: string) => ({ iid, id: "v2_boss_mountain_axe" as const });
const normal = (iid: string) => ({ iid, id: "v2_iron_sword" as const });

describe("유니크 장비 누적 획득", () => {
  it("레거시 보유량·유니크 도감·수령 단계 중 가장 높은 값을 시작값으로 보존한다", () => {
    expect(
      uniqueEquipmentAcquisitionProgress({
        adventureLogRaw: {},
        equipmentRaw: { owned: [unique("u1"), unique("u2"), normal("n1")] },
        equipmentCodexRaw: {
          registeredIds: [
            "v2_boss_mountain_axe",
            "v2_boss_canyon_fang",
            "v2_iron_sword",
          ],
        },
        minimum: 5,
      }),
    ).toBe(5);
  });

  it("판매로 인벤토리가 비어도 저장된 누적 획득량은 내려가지 않는다", () => {
    expect(
      uniqueEquipmentAcquisitionProgress({
        adventureLogRaw: { uniqueEquipmentAcquired: 28 },
        equipmentRaw: { owned: [] },
        equipmentCodexRaw: {},
      }),
    ).toBe(28);
  });

  it("새로 발급된 유니크만 누적하고 일반 장비와 거래성 이동은 증가시키지 않는다", () => {
    const gained = applyUniqueEquipmentAcquisitions({
      adventureLogRaw: { uniqueEquipmentAcquired: 28, battleLosses: 3 },
      equipmentOwnedAfter: [unique("u29"), normal("n1")],
      equipmentCodexRaw: {},
      acquiredIds: ["v2_boss_mountain_axe", "v2_iron_sword"],
    });
    expect(gained).toEqual({
      uniqueEquipmentAcquired: 29,
      battleLosses: 3,
    });

    const transferred = applyUniqueEquipmentAcquisitions({
      adventureLogRaw: gained,
      equipmentOwnedAfter: [unique("u29")],
      equipmentCodexRaw: {},
      acquiredIds: [],
    });
    expect(transferred).toBe(gained);
  });

  it("손상된 저장값은 0으로 정규화한다", () => {
    expect(persistedUniqueEquipmentAcquired({ uniqueEquipmentAcquired: -3 })).toBe(0);
    expect(persistedUniqueEquipmentAcquired({ uniqueEquipmentAcquired: "bad" })).toBe(0);
  });
});
