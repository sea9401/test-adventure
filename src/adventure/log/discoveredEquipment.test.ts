import { describe, expect, it } from "vitest";
import { ITEMS } from "@/adventure/data/items";
import { emptyInventory, type InventoryState } from "@/adventure/inventory/useInventory";
import type { EquippedSlots } from "@/adventure/character/types";
import {
  currentlyHeldVariants,
  parseVariantKey,
  resolveVariant,
  variantDisplayName,
  variantGradeLabel,
  variantKey,
} from "./discoveredEquipment";

describe("variantKey / parseVariantKey", () => {
  it("등급 0/미지정 → base, 왕복 변환", () => {
    expect(variantKey()).toBe("base");
    expect(variantKey(0, 0)).toBe("base");
    expect(parseVariantKey("base")).toEqual({ kind: "base" });
  });

  it("제작 등급", () => {
    expect(variantKey(2, null)).toBe("c2");
    expect(variantKey(-1, null)).toBe("c-1");
    expect(parseVariantKey("c2")).toEqual({ kind: "crafted", tier: 2 });
    expect(parseVariantKey("c-1")).toEqual({ kind: "crafted", tier: -1 });
  });

  it("드랍 등급", () => {
    expect(variantKey(null, 1)).toBe("d1");
    expect(variantKey(null, 2)).toBe("d2");
    expect(parseVariantKey("d2")).toEqual({ kind: "dropped", quality: 2 });
  });

  it("깨진 키는 null", () => {
    expect(parseVariantKey("c9")).toBeNull();
    expect(parseVariantKey("d0")).toBeNull();
    expect(parseVariantKey("zzz")).toBeNull();
  });
});

describe("resolveVariant / 표시명", () => {
  it("없는 itemId 는 null", () => {
    expect(resolveVariant("no_such_item" as never, "base")).toBeNull();
  });

  it("base 변형 = ITEMS 그대로", () => {
    expect(resolveVariant("baseball_bat", "base")).toBe(ITEMS.baseball_bat);
  });

  it("표시명 — base / 드랍(접두) / 제작(접미)", () => {
    expect(variantDisplayName("baseball_bat", "base")).toBe("야구 방망이");
    expect(variantDisplayName("baseball_bat", "d1")).toBe("정교한 야구 방망이");
    expect(variantDisplayName("baseball_bat", "c2")).toBe("야구 방망이 ⟨걸작⟩");
  });

  it("등급 라벨 — base 는 null", () => {
    expect(variantGradeLabel("base")).toBeNull();
    expect(variantGradeLabel("d1")).toBe("정교한");
    expect(variantGradeLabel("c-2")).toBe("불량");
  });
});

function inv(partial: Partial<InventoryState>): InventoryState {
  return { ...emptyInventory(), ...partial };
}

describe("currentlyHeldVariants", () => {
  it("equipment / crafted / dropped / 장착 슬롯을 모두 모은다", () => {
    const state = inv({
      equipment: { baseball_bat: 2, branch_stick: 0 },
      craftedEquipment: { baseball_bat: { "2": 1, "-1": 0 } },
      droppedEquipment: { baseball_bat: { "1": 3 } },
    });
    const equipped: EquippedSlots = {
      weapon: { ...ITEMS.nailed_baseball_bat, dropQuality: 2 },
      armor: { ...ITEMS.cloth_clothes },
      accessory: null,
    };
    const held = currentlyHeldVariants(state, equipped);
    expect([...(held.get("baseball_bat") ?? [])].sort()).toEqual(
      ["base", "c2", "d1"].sort(),
    );
    expect([...(held.get("nailed_baseball_bat") ?? [])]).toEqual(["d2"]);
    expect([...(held.get("cloth_clothes") ?? [])]).toEqual(["base"]);
    // 수량 0 인 것은 안 들어감.
    expect(held.has("branch_stick")).toBe(false);
  });

  it("빈 인벤토리·장착 없음 → 빈 맵", () => {
    const held = currentlyHeldVariants(
      inv({ equipment: {}, materials: {} }),
      { weapon: null, armor: null, accessory: null },
    );
    expect(held.size).toBe(0);
  });

  it("equipmentInstances 풀의 별빛 무구도 도감에 등록 — craftTier 별 변형 키", () => {
    const state = inv({
      equipmentInstances: [
        {
          instanceId: "i1",
          itemId: "starlit_greatsword_str",
          enhancementLevel: 0,
          remainingAttempts: 7,
        },
        {
          instanceId: "i2",
          itemId: "starlit_lance_luk",
          craftTier: 1,
          enhancementLevel: 3,
          enhanceHistory: ["safe", "safe", "safe"],
          remainingAttempts: 7,
        },
      ],
    });
    const held = currentlyHeldVariants(state, {
      weapon: null,
      armor: null,
      accessory: null,
    });
    expect([...(held.get("starlit_greatsword_str") ?? [])]).toEqual(["base"]);
    expect([...(held.get("starlit_lance_luk") ?? [])]).toEqual(["c1"]);
  });
});
