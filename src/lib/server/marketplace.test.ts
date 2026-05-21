// 마켓플레이스 서버 헬퍼의 순수 함수만 검증. DB I/O (라우트 통합) 는 인프라 없어 제외 —
// 수동 시나리오(npm run dev + 등록/구매/취소/유찰 라운드트립)로 검증.

import { describe, expect, it } from "vitest";
import {
  addGradedEquip,
  addInstance,
  addToCategory,
  deductFromCategory,
  deductGradedEquip,
  deductInstanceById,
  instanceListingGrade,
  inventoryCategoryForGrade,
  isValidGrade,
  type InventoryShape,
} from "./marketplace";
import type { EquipmentInstance } from "@/adventure/inventory/equipmentInstances";

describe("isValidGrade", () => {
  it("vault variant 키 7종은 허용", () => {
    for (const g of ["base", "c-2", "c-1", "c1", "c2", "d1", "d2"]) {
      expect(isValidGrade(g)).toBe(true);
    }
  });

  it("규약 밖 문자열은 거부", () => {
    for (const g of ["", "c0", "c3", "c-3", "d0", "d3", "e1", "BASE", "c1 "]) {
      expect(isValidGrade(g)).toBe(false);
    }
  });
});

describe("inventoryCategoryForGrade", () => {
  it("base → equipment, c* → craftedEquipment, d* → droppedEquipment", () => {
    expect(inventoryCategoryForGrade("base")).toBe("equipment");
    expect(inventoryCategoryForGrade("c-2")).toBe("craftedEquipment");
    expect(inventoryCategoryForGrade("c1")).toBe("craftedEquipment");
    expect(inventoryCategoryForGrade("d1")).toBe("droppedEquipment");
    expect(inventoryCategoryForGrade("d2")).toBe("droppedEquipment");
  });
});

describe("deductGradedEquip", () => {
  it("base — equipment[] 에서 차감", () => {
    const inv: InventoryShape = { equipment: { baseball_bat: 3 } };
    const next = deductGradedEquip(inv, "baseball_bat", "base", 1);
    expect(next).not.toBeNull();
    expect(next!.equipment).toEqual({ baseball_bat: 2 });
  });

  it("base 차감 후 0이면 키 삭제", () => {
    const inv: InventoryShape = { equipment: { baseball_bat: 1, other: 5 } };
    const next = deductGradedEquip(inv, "baseball_bat", "base", 1)!;
    expect(next.equipment).toEqual({ other: 5 });
  });

  it("c1 (고급) — craftedEquipment 의 nested 슬롯에서 차감", () => {
    const inv: InventoryShape = {
      craftedEquipment: { baseball_bat: { "1": 2, "2": 1 } },
    };
    const next = deductGradedEquip(inv, "baseball_bat", "c1", 1)!;
    expect(next.craftedEquipment).toEqual({
      baseball_bat: { "1": 1, "2": 1 },
    });
  });

  it("c-2 (불량) — 마지막 1개 차감 시 내부 슬롯 + outer 키 둘 다 정리", () => {
    const inv: InventoryShape = {
      craftedEquipment: {
        baseball_bat: { "-2": 1 },
        other: { "1": 3 },
      },
    };
    const next = deductGradedEquip(inv, "baseball_bat", "c-2", 1)!;
    expect(next.craftedEquipment).toEqual({ other: { "1": 3 } });
  });

  it("d2 (빼어난) — droppedEquipment 에서 차감", () => {
    const inv: InventoryShape = {
      droppedEquipment: { baseball_bat: { "2": 1 } },
    };
    const next = deductGradedEquip(inv, "baseball_bat", "d2", 1)!;
    // 마지막 한 개 차감 → outer 키도 사라짐
    expect(next.droppedEquipment).toEqual({});
  });

  it("재고 부족 시 null", () => {
    const inv: InventoryShape = {
      craftedEquipment: { baseball_bat: { "1": 0 } },
    };
    expect(deductGradedEquip(inv, "baseball_bat", "c1", 1)).toBeNull();
    expect(deductGradedEquip({}, "baseball_bat", "c1", 1)).toBeNull();
    expect(deductGradedEquip({ equipment: {} }, "baseball_bat", "base", 1)).toBeNull();
  });

  it("다른 storage 는 immutable 하게 유지", () => {
    const inv: InventoryShape = {
      equipment: { other: 5 },
      craftedEquipment: { baseball_bat: { "1": 2 } },
      droppedEquipment: { foo: { "1": 1 } },
    };
    const next = deductGradedEquip(inv, "baseball_bat", "c1", 1)!;
    expect(next.equipment).toBe(inv.equipment);
    expect(next.droppedEquipment).toBe(inv.droppedEquipment);
  });
});

describe("addGradedEquip", () => {
  it("base — equipment[] 에 가산", () => {
    const inv: InventoryShape = { equipment: { baseball_bat: 1 } };
    const next = addGradedEquip(inv, "baseball_bat", "base", 2);
    expect(next.equipment).toEqual({ baseball_bat: 3 });
  });

  it("c1 — craftedEquipment 신규 슬롯 생성", () => {
    const next = addGradedEquip({}, "baseball_bat", "c1", 1);
    expect(next.craftedEquipment).toEqual({ baseball_bat: { "1": 1 } });
  });

  it("c2 — 기존 슬롯에 누적", () => {
    const inv: InventoryShape = {
      craftedEquipment: { baseball_bat: { "1": 1, "2": 2 } },
    };
    const next = addGradedEquip(inv, "baseball_bat", "c2", 1);
    expect(next.craftedEquipment).toEqual({
      baseball_bat: { "1": 1, "2": 3 },
    });
  });

  it("d1 — droppedEquipment 신규 슬롯", () => {
    const next = addGradedEquip({}, "baseball_bat", "d1", 5);
    expect(next.droppedEquipment).toEqual({ baseball_bat: { "1": 5 } });
  });

  it("잘못된 grade 는 base 로 fallback (구 데이터 호환)", () => {
    const next = addGradedEquip({}, "baseball_bat", "garbage", 1);
    expect(next.equipment).toEqual({ baseball_bat: 1 });
    expect(next.craftedEquipment).toBeUndefined();
  });
});

// 기존 평면 helpers 도 함께 회귀 — addGradedEquip("base") 가 addToCategory 와 호환.
describe("기존 평면 helpers — 회귀", () => {
  it("deductFromCategory 변경 없음", () => {
    const next = deductFromCategory({ x: 3 }, "x", 1);
    expect(next).toEqual({ x: 2 });
  });

  it("addToCategory 변경 없음", () => {
    const next = addToCategory({ x: 1 }, "x", 2);
    expect(next).toEqual({ x: 3 });
  });
});

const ringInst: EquipmentInstance = {
  instanceId: "ring-1",
  itemId: "starlit_ring",
  enhancementLevel: 0,
  remainingAttempts: 0,
  rolledBonus: { str: 12, spd: 8 },
};
const wepInst: EquipmentInstance = {
  instanceId: "wep-1",
  itemId: "starlit_blade_str",
  craftTier: 1,
  enhancementLevel: 4,
  enhanceHistory: ["safe", "safe", "safe", "safe"],
  remainingAttempts: 3,
  enchantSlots: [{ affixId: "might", value: 7 }],
};

describe("deductInstanceById", () => {
  it("instanceId 로 빼내고 새 inv 반환", () => {
    const inv: InventoryShape = { equipmentInstances: [ringInst, wepInst] };
    const r = deductInstanceById(inv, "ring-1")!;
    expect(r.instance).toEqual(ringInst);
    expect(r.inv.equipmentInstances).toEqual([wepInst]);
    // 원본 불변
    expect(inv.equipmentInstances).toHaveLength(2);
  });
  it("없으면 null", () => {
    expect(deductInstanceById({ equipmentInstances: [ringInst] }, "nope")).toBeNull();
    expect(deductInstanceById({}, "ring-1")).toBeNull();
  });
});

describe("addInstance", () => {
  it("추가", () => {
    const next = addInstance({ equipmentInstances: [ringInst] }, wepInst);
    expect(next.equipmentInstances).toEqual([ringInst, wepInst]);
  });
  it("instanceId 중복이면 무시(멱등)", () => {
    const next = addInstance({ equipmentInstances: [ringInst] }, ringInst);
    expect(next.equipmentInstances).toHaveLength(1);
  });
  it("빈 인벤에도 추가", () => {
    expect(addInstance({}, ringInst).equipmentInstances).toEqual([ringInst]);
  });
});

describe("instanceListingGrade", () => {
  it("craftTier 가 c±N 이면 c{tier}", () => {
    expect(instanceListingGrade(1)).toBe("c1");
    expect(instanceListingGrade(-2)).toBe("c-2");
  });
  it("0/미지정(고리 등)은 base", () => {
    expect(instanceListingGrade(0)).toBe("base");
    expect(instanceListingGrade(undefined)).toBe("base");
  });
});
