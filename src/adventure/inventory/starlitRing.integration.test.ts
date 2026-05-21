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
