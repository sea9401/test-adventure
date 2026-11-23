import { describe, expect, it } from "vitest";
import { parseEquipmentSave, type V2EquipInstance } from "@/adventure/data/v2/v2Equipment";
import { mintListedEquipInstance } from "@/adventure/data/v2/v2EquipMint";
import {
  RELIST_DEFAULT_CUT,
  RELIST_PRICE_CUTS,
  canRelist,
  findRelistEquipInstance,
  relistCutLabel,
  relistPrice,
  relistRequest,
} from "./relist";

const PAYLOAD = { power: 7, weight: 3, options: { atk: 2 }, enhance: { level: 3, bonusPct: 6 } };

function returned(payload: unknown = PAYLOAD): V2EquipInstance {
  // 유찰되면 서버가 이 함수로 새 개체를 만들어 가방에 돌려준다.
  const saved = parseEquipmentSave({
    owned: [mintListedEquipInstance("v2_chain_mail", payload)],
    equipped: {},
  });
  return saved.owned[0];
}

const listing = {
  kind: "equip" as const,
  itemId: "v2_chain_mail",
  quantity: 1,
  instancePayload: PAYLOAD,
};

describe("다시 올리기 가격", () => {
  it("기본은 30% 인하이고 10%, 같은 가격을 고를 수 있다", () => {
    expect(RELIST_PRICE_CUTS).toEqual([30, 10, 0]);
    expect(RELIST_DEFAULT_CUT).toBe(30);
    expect(relistPrice(10_000, 30)).toBe(7_000);
    expect(relistPrice(10_000, 10)).toBe(9_000);
    expect(relistPrice(10_000, 0)).toBe(10_000);
    expect(relistCutLabel(30)).toBe("30% 낮춤");
    expect(relistCutLabel(0)).toBe("같은 가격");
  });

  it("소수는 버리고 1골드 아래로 내려가지 않는다", () => {
    expect(relistPrice(999, 30)).toBe(699);
    expect(relistPrice(1, 30)).toBe(1);
    expect(relistPrice(0, 30)).toBe(1);
  });
});

describe("다시 올릴 수 있는 매물", () => {
  it("내가 올렸다가 유찰된 장비와 재료만 해당한다", () => {
    expect(canRelist({ isMine: true, closedStatus: "expired", kind: "equip" })).toBe(true);
    expect(canRelist({ isMine: true, closedStatus: "expired", kind: "material" })).toBe(true);
    expect(canRelist({ isMine: true, closedStatus: "cancelled", kind: "equip" })).toBe(false);
    expect(canRelist({ isMine: true, closedStatus: "expired", kind: "consumable" })).toBe(false);
    expect(canRelist({ isMine: false, closedStatus: "expired", kind: "equip" })).toBe(false);
  });
});

describe("가방에서 돌아온 장비 찾기", () => {
  it("돌아온 개체를 찾아 등록 요청을 만든다", () => {
    const piece = returned();
    const other = returned({ power: 5, weight: 3 });
    expect(findRelistEquipInstance([other, piece], {}, listing)?.iid).toBe(piece.iid);
    expect(
      relistRequest(listing, { owned: [other, piece], equipped: {}, materials: {} }, 7_000, 12),
    ).toEqual({
      ok: true,
      body: { durationHours: 12, kind: "equip", iid: piece.iid, price: 7_000 },
    });
  });

  it("장착했거나 잠갔거나 돌아온 뒤 강화한 개체는 대상이 아니다", () => {
    const piece = returned();
    expect(findRelistEquipInstance([piece], { armor: piece.iid }, listing)).toBeNull();
    expect(findRelistEquipInstance([{ ...piece, locked: true }], {}, listing)).toBeNull();
    expect(
      findRelistEquipInstance(
        [{ ...piece, enhance: { level: 4, bonusPct: 8 } }],
        {},
        listing,
      ),
    ).toBeNull();
    expect(
      relistRequest(listing, { owned: [], equipped: {}, materials: {} }, 7_000, 6),
    ).toEqual({ ok: false, reason: "missing_equip" });
  });

  it("옵션이 없던 장비도 찾는다", () => {
    const plain = returned(null);
    expect(
      findRelistEquipInstance([plain], {}, { itemId: "v2_chain_mail", instancePayload: null })?.iid,
    ).toBe(plain.iid);
  });
});

describe("재료 다시 올리기", () => {
  const material = {
    kind: "material" as const,
    itemId: "v2_iron_ore",
    quantity: 40,
    instancePayload: null,
  };

  it("같은 묶음 수량으로 등록 요청을 만든다", () => {
    expect(
      relistRequest(material, { owned: [], equipped: {}, materials: { v2_iron_ore: 55 } }, 2_800, 24),
    ).toEqual({
      ok: true,
      body: { durationHours: 24, kind: "material", itemId: "v2_iron_ore", quantity: 40, price: 2_800 },
    });
  });

  it("보유 수량이 모자라면 올릴 수 없다", () => {
    expect(
      relistRequest(material, { owned: [], equipped: {}, materials: { v2_iron_ore: 12 } }, 2_800, 24),
    ).toEqual({ ok: false, reason: "missing_material", holding: 12 });
  });
});
