import { describe, expect, it } from "vitest";
import {
  depositToVaultPure,
  withdrawFromVaultPure,
  vaultVariantKey,
  parseVaultVariantKey,
  inventoryCountFor,
} from "./vaultOps";
import type { InventoryState } from "./state";

function emptyInv(): InventoryState {
  return {
    potions: {},
    equipment: {},
    craftedEquipment: {},
    droppedEquipment: {},
    vault: {},
    materials: {},
    consumables: {},
  };
}

describe("vaultVariantKey", () => {
  it("0/없음 → base", () => {
    expect(vaultVariantKey()).toBe("base");
    expect(vaultVariantKey(0, 0)).toBe("base");
    expect(vaultVariantKey(null, null)).toBe("base");
  });

  it("제작 등급은 c±N", () => {
    expect(vaultVariantKey(1)).toBe("c1");
    expect(vaultVariantKey(2)).toBe("c2");
    expect(vaultVariantKey(-1)).toBe("c-1");
    expect(vaultVariantKey(-2)).toBe("c-2");
  });

  it("드랍 등급은 dN (tier 가 0/없음일 때만)", () => {
    expect(vaultVariantKey(0, 1)).toBe("d1");
    expect(vaultVariantKey(undefined, 2)).toBe("d2");
  });

  it("tier 와 quality 동시면 tier 우선 (실제로는 동시 발생 X)", () => {
    expect(vaultVariantKey(1, 2)).toBe("c1");
  });
});

describe("inventoryCountFor", () => {
  it("base 는 equipment[] 조회", () => {
    const inv = { ...emptyInv(), equipment: { hero_sword: 3 } };
    expect(inventoryCountFor(inv, "hero_sword", "base")).toBe(3);
  });

  it("c1 은 craftedEquipment 의 tier 1 조회", () => {
    const inv = {
      ...emptyInv(),
      craftedEquipment: { hero_sword: { "1": 2 } },
    };
    expect(inventoryCountFor(inv, "hero_sword", "c1")).toBe(2);
    expect(inventoryCountFor(inv, "hero_sword", "c2")).toBe(0);
  });

  it("d2 는 droppedEquipment 의 quality 2 조회", () => {
    const inv = {
      ...emptyInv(),
      droppedEquipment: { hero_sword: { "2": 5 } },
    };
    expect(inventoryCountFor(inv, "hero_sword", "d2")).toBe(5);
    expect(inventoryCountFor(inv, "hero_sword", "d1")).toBe(0);
  });

  it("보유 없는 항목은 0", () => {
    expect(inventoryCountFor(emptyInv(), "hero_sword", "base")).toBe(0);
    expect(inventoryCountFor(emptyInv(), "hero_sword", "c1")).toBe(0);
  });
});

describe("parseVaultVariantKey", () => {
  it("라운드트립", () => {
    expect(parseVaultVariantKey("base")).toEqual({});
    expect(parseVaultVariantKey("c1")).toEqual({ tier: 1 });
    expect(parseVaultVariantKey("c-2")).toEqual({ tier: -2 });
    expect(parseVaultVariantKey("d1")).toEqual({ quality: 1 });
    expect(parseVaultVariantKey("d2")).toEqual({ quality: 2 });
  });

  it("이상한 키는 base 취급", () => {
    expect(parseVaultVariantKey("xyz")).toEqual({});
    expect(parseVaultVariantKey("c99")).toEqual({});
    expect(parseVaultVariantKey("d3")).toEqual({});
  });
});

describe("depositToVaultPure — base 등급", () => {
  it("equipment[] 에서 1개 차감 + vault.base 1개 증가", () => {
    const cur = { ...emptyInv(), equipment: { hero_sword: 2 } };
    const next = depositToVaultPure(cur, "hero_sword");
    expect(next).not.toBeNull();
    expect(next!.equipment.hero_sword).toBe(1);
    expect(next!.vault.hero_sword?.base).toBe(1);
  });

  it("보유 없으면 null", () => {
    const cur = emptyInv();
    expect(depositToVaultPure(cur, "hero_sword")).toBeNull();
  });

  it("0개로 떨어지면 equipment 에는 0 으로 남고 vault 가 카운트", () => {
    const cur = { ...emptyInv(), equipment: { hero_sword: 1 } };
    const next = depositToVaultPure(cur, "hero_sword");
    expect(next!.equipment.hero_sword).toBe(0);
    expect(next!.vault.hero_sword?.base).toBe(1);
  });

  it("n <= 0 은 null", () => {
    const cur = { ...emptyInv(), equipment: { hero_sword: 5 } };
    expect(depositToVaultPure(cur, "hero_sword", undefined, undefined, 0)).toBeNull();
    expect(depositToVaultPure(cur, "hero_sword", undefined, undefined, -1)).toBeNull();
  });
});

describe("depositToVaultPure — 제작 등급", () => {
  it("craftedEquipment 의 tier 1 에서 1개 차감 + vault.c1 1개 증가", () => {
    const cur = {
      ...emptyInv(),
      craftedEquipment: { hero_sword: { "1": 2 } },
    };
    const next = depositToVaultPure(cur, "hero_sword", 1);
    expect(next!.craftedEquipment.hero_sword?.["1"]).toBe(1);
    expect(next!.vault.hero_sword?.c1).toBe(1);
  });

  it("마지막 1개가 빠지면 craftedEquipment 의 tier 키가 사라진다", () => {
    const cur = {
      ...emptyInv(),
      craftedEquipment: { hero_sword: { "1": 1, "2": 3 } },
    };
    const next = depositToVaultPure(cur, "hero_sword", 1);
    expect(next!.craftedEquipment.hero_sword?.["1"]).toBeUndefined();
    expect(next!.craftedEquipment.hero_sword?.["2"]).toBe(3);
  });

  it("마지막 tier 까지 빠지면 itemId 자체가 craftedEquipment 에서 삭제", () => {
    const cur = {
      ...emptyInv(),
      craftedEquipment: { hero_sword: { "1": 1 } },
    };
    const next = depositToVaultPure(cur, "hero_sword", 1);
    expect(next!.craftedEquipment.hero_sword).toBeUndefined();
  });
});

describe("depositToVaultPure — 드랍 등급", () => {
  it("droppedEquipment 의 quality 1 에서 1개 차감 + vault.d1 1개 증가", () => {
    const cur = {
      ...emptyInv(),
      droppedEquipment: { hero_sword: { "1": 2 } },
    };
    const next = depositToVaultPure(cur, "hero_sword", undefined, 1);
    expect(next!.droppedEquipment.hero_sword?.["1"]).toBe(1);
    expect(next!.vault.hero_sword?.d1).toBe(1);
  });
});

describe("withdrawFromVaultPure", () => {
  it("vault.base → equipment[]", () => {
    const cur = { ...emptyInv(), vault: { hero_sword: { base: 2 } } };
    const next = withdrawFromVaultPure(cur, "hero_sword", "base");
    expect(next!.vault.hero_sword?.base).toBe(1);
    expect(next!.equipment.hero_sword).toBe(1);
  });

  it("vault.c1 → craftedEquipment.tier1", () => {
    const cur = { ...emptyInv(), vault: { hero_sword: { c1: 1 } } };
    const next = withdrawFromVaultPure(cur, "hero_sword", "c1");
    expect(next!.vault.hero_sword).toBeUndefined();
    expect(next!.craftedEquipment.hero_sword?.["1"]).toBe(1);
  });

  it("vault.d2 → droppedEquipment.q2", () => {
    const cur = { ...emptyInv(), vault: { hero_sword: { d2: 3 } } };
    const next = withdrawFromVaultPure(cur, "hero_sword", "d2");
    expect(next!.vault.hero_sword?.d2).toBe(2);
    expect(next!.droppedEquipment.hero_sword?.["2"]).toBe(1);
  });

  it("vault 에 없으면 null", () => {
    const cur = emptyInv();
    expect(withdrawFromVaultPure(cur, "hero_sword", "base")).toBeNull();
  });

  it("vault 마지막 1개가 빠지면 variantKey 가 사라지고, 마지막이면 itemId 자체도 삭제", () => {
    const cur = { ...emptyInv(), vault: { hero_sword: { c1: 1, d2: 1 } } };
    const next = withdrawFromVaultPure(cur, "hero_sword", "c1");
    expect(next!.vault.hero_sword?.c1).toBeUndefined();
    expect(next!.vault.hero_sword?.d2).toBe(1);

    const next2 = withdrawFromVaultPure(next!, "hero_sword", "d2");
    expect(next2!.vault.hero_sword).toBeUndefined();
  });
});

describe("deposit ↔ withdraw 라운드트립", () => {
  it("base 라운드트립 — 원본과 동일", () => {
    const start = { ...emptyInv(), equipment: { hero_sword: 3 } };
    const deposited = depositToVaultPure(start, "hero_sword")!;
    const round = withdrawFromVaultPure(deposited, "hero_sword", "base")!;
    expect(round.equipment.hero_sword).toBe(3);
    expect(round.vault.hero_sword).toBeUndefined();
  });

  it("crafted 라운드트립", () => {
    const start = {
      ...emptyInv(),
      craftedEquipment: { hero_sword: { "1": 2 } },
    };
    const deposited = depositToVaultPure(start, "hero_sword", 1)!;
    const round = withdrawFromVaultPure(deposited, "hero_sword", "c1")!;
    expect(round.craftedEquipment.hero_sword?.["1"]).toBe(2);
    expect(round.vault.hero_sword).toBeUndefined();
  });

  it("dropped 라운드트립 — q2", () => {
    const start = {
      ...emptyInv(),
      droppedEquipment: { hero_sword: { "2": 1 } },
    };
    const deposited = depositToVaultPure(start, "hero_sword", undefined, 2)!;
    const round = withdrawFromVaultPure(deposited, "hero_sword", "d2")!;
    expect(round.droppedEquipment.hero_sword?.["2"]).toBe(1);
    expect(round.vault.hero_sword).toBeUndefined();
  });

  it("여러 변형 동시 보관 — 독립적", () => {
    let s: InventoryState = {
      ...emptyInv(),
      equipment: { hero_sword: 1 },
      craftedEquipment: { hero_sword: { "1": 1 } },
      droppedEquipment: { hero_sword: { "2": 1 } },
    };
    s = depositToVaultPure(s, "hero_sword")!;
    s = depositToVaultPure(s, "hero_sword", 1)!;
    s = depositToVaultPure(s, "hero_sword", undefined, 2)!;
    expect(s.vault.hero_sword?.base).toBe(1);
    expect(s.vault.hero_sword?.c1).toBe(1);
    expect(s.vault.hero_sword?.d2).toBe(1);

    // 변형 하나만 꺼내도 나머지는 vault 에 그대로
    s = withdrawFromVaultPure(s, "hero_sword", "c1")!;
    expect(s.vault.hero_sword?.base).toBe(1);
    expect(s.vault.hero_sword?.c1).toBeUndefined();
    expect(s.vault.hero_sword?.d2).toBe(1);
    expect(s.craftedEquipment.hero_sword?.["1"]).toBe(1);
  });
});
