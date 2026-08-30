import { describe, expect, it } from "vitest";
import {
  V2_EQUIPMENT,
  shopPriceForSell,
  type V2EquipInstance,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";
import { shopSellEquipmentInstances } from "./V2ShopView";
import { boundEquipmentDisposalConfirmation } from "./item-card/shared";

describe("shopSellEquipmentInstances", () => {
  it("keeps same-name equipment as separate selectable instances", () => {
    const item = Object.values(V2_EQUIPMENT).find(
      (candidate) =>
        candidate.slot === "weapon" && shopPriceForSell(candidate) != null,
    );
    expect(item).toBeDefined();
    const id = item?.id as V2EquipmentId;
    const owned: V2EquipInstance[] = [
      {
        iid: "same-item-low",
        id,
        roll: { power: 10, weight: 5 },
      },
      {
        iid: "same-item-high",
        id,
        roll: { power: 20, weight: 3 },
      },
    ];

    const result = shopSellEquipmentInstances(owned, "weapon");

    expect(result).toHaveLength(2);
    expect(result.map((instance) => instance.iid).sort()).toEqual([
      "same-item-high",
      "same-item-low",
    ]);
    expect(result[0]).not.toBe(result[1]);
  });
});

describe("귀속 장비 판매 재확인", () => {
  it("장비 이름·해방 단계와 영구 소멸 경고를 표시한다", () => {
    const confirmation = boundEquipmentDisposalConfirmation(
      [{
        iid: "bound-1",
        itemName: "재앙독 완갑",
        liberation: {
          rank: 2,
          lineCount: 3,
          revision: 4,
          options: [],
        },
      }],
      "판매",
    );

    expect(confirmation.message).toContain("재앙독 완갑");
    expect(confirmation.message).toContain("해방 2 · 3줄");
    expect(confirmation.message).toContain("귀속 및 모든 해방 옵션이 영구 소멸");
    expect(confirmation.confirmLabel).toBe("영구 소멸 확인 · 판매");
  });
});
