import { describe, expect, it } from "vitest";
import {
  applyDisassemble,
  entryBlockReason,
  entryYield,
  planDisassemble,
  RARITY_DUST_YIELD,
  type DisassembleRequest,
} from "./disassemble";
import { emptyInventory, type InventoryState } from "../inventory/useInventory";
import { ITEMS } from "../data/items";
import type { EquippedSlots } from "../character/types";

// 빈 슬롯. 개별 테스트에서 필요한 슬롯만 채워서 쓴다.
const NO_SLOTS: EquippedSlots = { weapon: null, armor: null, accessory: null };

function withInventory(patch: Partial<InventoryState>): InventoryState {
  return { ...emptyInventory(), ...patch };
}

describe("disassemble — 수율", () => {
  it("rarity 별 마력가루 수율은 RARITY_DUST_YIELD 와 동치", () => {
    // 대표 itemId 한 점씩 — rarity 가 코드에서 어떻게 묶이는지 검사.
    // common(미지정 포함)/uncommon/rare/unique/legendary 모두.
    const samples: Array<[keyof typeof ITEMS, number]> = [
      ["branch_stick", RARITY_DUST_YIELD.common],           // 미지정 → common
      ["crab_shell_buckler", RARITY_DUST_YIELD.uncommon],   // uncommon
      ["mole_king_drill", RARITY_DUST_YIELD.unique],        // unique
    ];
    for (const [itemId, expected] of samples) {
      expect(entryYield({ kind: "equipment", itemId })).toBe(expected);
    }
  });

  it("재료는 명단에 있으면 가중, 없으면 1", () => {
    expect(entryYield({ kind: "material", materialId: "slime_chunk" })).toBe(1);
    expect(entryYield({ kind: "material", materialId: "mana_crystal" })).toBe(3);
    expect(entryYield({ kind: "material", materialId: "phoenix_feather" })).toBe(5);
  });

  it("mana_dust 자체의 수율은 0 — 분해 대상이 아니라는 신호", () => {
    expect(entryYield({ kind: "material", materialId: "mana_dust" })).toBe(0);
  });
});

describe("disassemble — 잠금", () => {
  it("시작 장비(branch_stick / cloth_clothes / mom_amulet) 는 starter-gear 로 차단", () => {
    const inv = withInventory({ equipment: { branch_stick: 1, cloth_clothes: 1, mom_amulet: 1 } });
    for (const itemId of ["branch_stick", "cloth_clothes", "mom_amulet"] as const) {
      expect(
        entryBlockReason({ kind: "equipment", itemId }, 1, inv, NO_SLOTS),
      ).toBe("starter-gear");
    }
  });

  it("어느 슬롯이든 장착 중인 itemId 는 equipped 로 차단", () => {
    // 인벤에 여분이 있어도, 같은 itemId 가 장착 슬롯에 있으면 차단.
    const inv = withInventory({ equipment: { worn_dagger: 3 } });
    const slots: EquippedSlots = {
      weapon: ITEMS.worn_dagger,
      armor: null,
      accessory: null,
    };
    expect(
      entryBlockReason({ kind: "equipment", itemId: "worn_dagger" }, 1, inv, slots),
    ).toBe("equipped");
  });

  it("mana_dust 자체는 분해 시도 시 mana-dust 사유로 차단", () => {
    const inv = withInventory({ materials: { mana_dust: 50 } });
    expect(
      entryBlockReason({ kind: "material", materialId: "mana_dust" }, 1, inv, NO_SLOTS),
    ).toBe("mana-dust");
  });

  it("보유량보다 많이 요청하면 not-enough", () => {
    const inv = withInventory({ equipment: { crab_shell_buckler: 1 } });
    expect(
      entryBlockReason({ kind: "equipment", itemId: "crab_shell_buckler" }, 2, inv, NO_SLOTS),
    ).toBe("not-enough");
  });

  it("정상 요청은 null — 분해 가능", () => {
    const inv = withInventory({ equipment: { crab_shell_buckler: 1 } });
    expect(
      entryBlockReason({ kind: "equipment", itemId: "crab_shell_buckler" }, 1, inv, NO_SLOTS),
    ).toBeNull();
  });
});

describe("disassemble — 계획", () => {
  it("정상/차단 항목을 분리하고 totalDust 를 합산", () => {
    const inv = withInventory({
      equipment: { crab_shell_buckler: 2, mole_king_drill: 1, branch_stick: 1 },
      materials: { slime_chunk: 5, mana_crystal: 2, mana_dust: 99 },
    });
    const req: DisassembleRequest = [
      { entry: { kind: "equipment", itemId: "crab_shell_buckler" }, count: 2 },   // ok: 3 ×2 = 6
      { entry: { kind: "equipment", itemId: "mole_king_drill" }, count: 1 }, // ok: 20
      { entry: { kind: "equipment", itemId: "branch_stick" }, count: 1 },    // 차단: starter
      { entry: { kind: "material", materialId: "slime_chunk" }, count: 3 },  // ok: 1 ×3 = 3
      { entry: { kind: "material", materialId: "mana_crystal" }, count: 2 }, // ok: 3 ×2 = 6
      { entry: { kind: "material", materialId: "mana_dust" }, count: 1 },    // 차단: mana-dust
    ];
    const plan = planDisassemble(req, inv, NO_SLOTS);
    expect(plan.totalDust).toBe(6 + 20 + 3 + 6);
    expect(plan.applied).toHaveLength(4);
    expect(plan.blocked.map((b) => b.reason).sort()).toEqual(
      ["mana-dust", "starter-gear"].sort(),
    );
  });
});

describe("disassemble — 적용", () => {
  it("재고를 차감하고 mana_dust 를 가산", () => {
    const inv = withInventory({
      equipment: { crab_shell_buckler: 2 },
      materials: { slime_chunk: 5 },
    });
    const plan = planDisassemble(
      [
        { entry: { kind: "equipment", itemId: "crab_shell_buckler" }, count: 2 },
        { entry: { kind: "material", materialId: "slime_chunk" }, count: 3 },
      ],
      inv,
      NO_SLOTS,
    );
    const next = applyDisassemble(plan, inv);
    // crab_shell_buckler: 3 ×2 = 6 dust, slime_chunk: 1 ×3 = 3 dust → 9 dust
    expect(next.materials.mana_dust).toBe(9);
    expect(next.equipment.crab_shell_buckler ?? 0).toBe(0); // 완전 소진 → 키 삭제
    expect("crab_shell_buckler" in next.equipment).toBe(false);
    expect(next.materials.slime_chunk).toBe(2);
    // 원본 immutable.
    expect(inv.materials.mana_dust).toBeUndefined();
    expect(inv.equipment.crab_shell_buckler).toBe(2);
  });

  it("기존 mana_dust 위에 누적", () => {
    const inv = withInventory({
      equipment: { crab_shell_buckler: 1 },
      materials: { mana_dust: 10 },
    });
    const plan = planDisassemble(
      [{ entry: { kind: "equipment", itemId: "crab_shell_buckler" }, count: 1 }],
      inv,
      NO_SLOTS,
    );
    const next = applyDisassemble(plan, inv);
    expect(next.materials.mana_dust).toBe(10 + 3);
  });

  it("craftedEquipment 분해 — 등급 키 삭제 + 빈 itemId 키 삭제", () => {
    const inv = withInventory({
      craftedEquipment: { crab_shell_buckler: { "1": 1, "2": 2 } },
    });
    const plan = planDisassemble(
      [{ entry: { kind: "craftedEquipment", itemId: "crab_shell_buckler", tier: 1 }, count: 1 }],
      inv,
      NO_SLOTS,
    );
    const next = applyDisassemble(plan, inv);
    expect(next.craftedEquipment.crab_shell_buckler).toEqual({ "2": 2 });

    // 한 번 더 분해해 나머지도 비우면 itemId 키 자체가 사라짐.
    const plan2 = planDisassemble(
      [{ entry: { kind: "craftedEquipment", itemId: "crab_shell_buckler", tier: 2 }, count: 2 }],
      next,
      NO_SLOTS,
    );
    const next2 = applyDisassemble(plan2, next);
    expect("crab_shell_buckler" in next2.craftedEquipment).toBe(false);
  });

  it("차단만 있고 적용이 없으면 원본 그대로 반환", () => {
    const inv = withInventory({ materials: { mana_dust: 5 } });
    const plan = planDisassemble(
      [{ entry: { kind: "material", materialId: "mana_dust" }, count: 1 }],
      inv,
      NO_SLOTS,
    );
    const next = applyDisassemble(plan, inv);
    expect(next).toBe(inv);
  });

  it("equipmentInstance 분해 — 풀에서 instanceId 로 제거 + legendary 수율 적용", () => {
    const inv = withInventory({
      equipmentInstances: [
        {
          instanceId: "inst-a",
          itemId: "starlit_greatsword_str",
          enhancementLevel: 0,
          remainingAttempts: 7,
        },
        {
          instanceId: "inst-b",
          itemId: "starlit_lance_luk",
          enhancementLevel: 3,
          enhanceHistory: ["safe", "safe", "safe"],
          remainingAttempts: 7,
        },
      ],
    });
    const plan = planDisassemble(
      [
        {
          entry: {
            kind: "equipmentInstance",
            instanceId: "inst-a",
            itemId: "starlit_greatsword_str",
          },
          count: 1,
        },
      ],
      inv,
      NO_SLOTS,
    );
    expect(plan.totalDust).toBe(RARITY_DUST_YIELD.legendary);
    const next = applyDisassemble(plan, inv);
    expect(next.equipmentInstances).toHaveLength(1);
    expect(next.equipmentInstances?.[0].instanceId).toBe("inst-b");
    expect(next.materials.mana_dust).toBe(RARITY_DUST_YIELD.legendary);
  });

  it("equipmentInstance 차단 — instanceId 가 슬롯에 있으면 equipped", () => {
    const inv = withInventory({
      equipmentInstances: [
        {
          instanceId: "inst-equip",
          itemId: "starlit_greatsword_str",
          enhancementLevel: 0,
          remainingAttempts: 7,
        },
      ],
    });
    const slots: EquippedSlots = {
      weapon: {
        ...ITEMS.starlit_greatsword_str,
        instanceId: "inst-equip",
        enhancementLevel: 0,
      },
      armor: null,
      accessory: null,
    };
    expect(
      entryBlockReason(
        {
          kind: "equipmentInstance",
          instanceId: "inst-equip",
          itemId: "starlit_greatsword_str",
        },
        1,
        inv,
        slots,
      ),
    ).toBe("equipped");
  });
});
