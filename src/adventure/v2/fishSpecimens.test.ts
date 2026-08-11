import { describe, expect, it } from "vitest";
import {
  FISH_SPECIMEN_SAVE_KEY,
  addFishSpecimen,
  fishIdFromSpecimenItemId,
  fishSpecimenItemId,
  parseFishSpecimenInventory,
  removeFishSpecimen,
} from "./fishSpecimens";

describe("물고기 표본 인벤토리", () => {
  it("저장 키와 밑줄이 포함된 어종의 거래 아이템 ID를 안정적으로 변환한다", () => {
    expect(FISH_SPECIMEN_SAVE_KEY).toBe("fishing-specimens.v1");
    expect(fishSpecimenItemId("platinum_carp")).toBe("fish_specimen_platinum_carp");
    expect(fishIdFromSpecimenItemId("fish_specimen_platinum_carp")).toBe("platinum_carp");
    expect(fishIdFromSpecimenItemId("fish_specimen_fake_fish")).toBeNull();
    expect(fishIdFromSpecimenItemId("carp")).toBeNull();
  });

  it("손상되거나 알 수 없는 수량을 버리고 안전한 정수만 보존한다", () => {
    expect(
      parseFishSpecimenInventory({
        version: 99,
        items: { carp: 2.9, fake: 9, bluefin_tuna: -1, trout: Number.POSITIVE_INFINITY },
      }),
    ).toEqual({ version: 1, items: { carp: 2 } });
    expect(parseFishSpecimenInventory(null)).toEqual({ version: 1, items: {} });
  });

  it("추가와 제거는 입력을 변경하지 않고 새 인벤토리를 반환한다", () => {
    const base = { version: 1 as const, items: { carp: 1 } };
    const added = addFishSpecimen(base, "carp", 2);
    const removed = removeFishSpecimen(added, "carp", 3);

    expect(base.items.carp).toBe(1);
    expect(added).toEqual({ version: 1, items: { carp: 3 } });
    expect(removed).toEqual({ version: 1, items: {} });
  });

  it("수량이 부족하거나 수량 인자가 유효하지 않으면 변경을 거부한다", () => {
    const inventory = { version: 1 as const, items: { carp: 1 } };

    expect(removeFishSpecimen(inventory, "carp", 2)).toBeNull();
    expect(removeFishSpecimen(inventory, "carp", 0)).toBeNull();
    expect(() => addFishSpecimen(inventory, "carp", 0)).toThrow();
  });
});
