import { describe, it, expect } from "vitest";
import {
  normalizeInstance,
  type EquipmentInstance,
} from "./equipmentInstances";
import {
  resolveStarlitRing,
  isStarlitRing,
  STARLIT_RING_ITEM_ID,
} from "./starlitRing";
import { rehydrateEquippedItem } from "@/adventure/character/rehydrateEquip";
import { buildEquipEntries } from "./equipEntries";
import type { InventoryState } from "./useInventory";

const ringRaw = {
  instanceId: "starlit-ring-abc",
  itemId: STARLIT_RING_ITEM_ID,
  rolledBonus: { str: 12, luk: 20 },
};

describe("normalizeInstance — 별빛 고리(롤 인스턴스)", () => {
  it("유효한 rolledBonus 면 통과 (강화/부여 메타는 0/없음 고정)", () => {
    const n = normalizeInstance(ringRaw);
    expect(n).not.toBeNull();
    expect(n!.itemId).toBe(STARLIT_RING_ITEM_ID);
    expect(n!.enhancementLevel).toBe(0);
    expect(n!.remainingAttempts).toBe(0);
    expect(n!.rolledBonus).toEqual({ str: 12, luk: 20 });
    expect(n!.enchantSlots).toBeUndefined();
  });

  it("rolledBonus 누락/위조면 drop(null)", () => {
    expect(normalizeInstance({ ...ringRaw, rolledBonus: undefined })).toBeNull();
    expect(normalizeInstance({ ...ringRaw, rolledBonus: { str: 21, luk: 5 } })).toBeNull(); // 범위 초과
    expect(normalizeInstance({ ...ringRaw, rolledBonus: { str: 5 } })).toBeNull(); // 1개
    expect(normalizeInstance({ ...ringRaw, rolledBonus: { atk: 5, luk: 5 } })).toBeNull(); // 허용 안 된 키
  });
});

describe("buildEquipEntries — 별빛 고리(롤 인스턴스) 가방 표시", () => {
  // 회귀 가드: 가방 목록이 ring 을 resolveEnhancedItem 으로 풀면 rolledBonus 가 사라져
  // "옵션 없는 빈 깡통" 으로 보였다(드랍돼도 안 떨어진 것처럼 보이던 버그). resolveStarlitRing
  // 분기를 타 롤 옵션이 보존돼야 한다.
  it("ring 인스턴스는 rolledBonus 가 보존돼 옵션이 보인다", () => {
    const inv = {
      equipment: {},
      craftedEquipment: {},
      droppedEquipment: {},
      equipmentInstances: [
        {
          instanceId: "starlit-ring-xyz",
          itemId: STARLIT_RING_ITEM_ID,
          enhancementLevel: 0,
          remainingAttempts: 0,
          rolledBonus: { str: 12, spd: 8 },
        },
      ],
    } as unknown as InventoryState;
    const ring = buildEquipEntries(inv).find(
      (e) => e.instanceId === "starlit-ring-xyz",
    );
    expect(ring).toBeDefined();
    expect(ring!.item.slot).toBe("accessory");
    expect(ring!.item.bonus).toEqual({ str: 12, spd: 8 });
    expect(ring!.item.stats).toEqual([
      { label: "힘", value: "+12" },
      { label: "속도", value: "+8" },
    ]);
  });
});

describe("resolveStarlitRing", () => {
  it("base + rolledBonus → bonus/stats/instanceId/rolledBonus", () => {
    const eq = resolveStarlitRing({ str: 12, luk: 20 }, "inst-1");
    expect(isStarlitRing(STARLIT_RING_ITEM_ID)).toBe(true);
    expect(eq.slot).toBe("accessory");
    expect(eq.bonus).toEqual({ str: 12, luk: 20 });
    expect(eq.instanceId).toBe("inst-1");
    expect(eq.rolledBonus).toEqual({ str: 12, luk: 20 });
    // 표시 stats 가 롤 반영
    expect(eq.stats).toEqual([
      { label: "힘", value: "+12" },
      { label: "행운", value: "+20" },
    ]);
  });
});

describe("rehydrateEquippedItem — 별빛 고리 라운드트립", () => {
  it("저장된 링 → 최신 정의로 재계산(롤 보존)", () => {
    const saved = resolveStarlitRing({ vit: 7, spd: 15 }, "inst-2");
    const re = rehydrateEquippedItem(saved);
    expect(re).not.toBeNull();
    expect(re!.bonus).toEqual({ vit: 7, spd: 15 });
    expect(re!.instanceId).toBe("inst-2");
    expect(re!.rolledBonus).toEqual({ vit: 7, spd: 15 });
  });

  it("rolledBonus 없으면 옵션 없는 base 로라도 살린다(슬롯 유지)", () => {
    const re = rehydrateEquippedItem({
      ...resolveStarlitRing({ str: 5, vit: 5 }, "inst-3"),
      rolledBonus: undefined,
    });
    expect(re).not.toBeNull(); // null 로 사라지지 않음
  });
});

// 인스턴스 타입 가드 — rolledBonus 가 EquipmentInstance 에 실린다.
const _typecheck: EquipmentInstance = {
  instanceId: "x",
  itemId: STARLIT_RING_ITEM_ID,
  enhancementLevel: 0,
  remainingAttempts: 0,
  rolledBonus: { str: 1, luk: 2 },
};
void _typecheck;
