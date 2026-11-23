// 유찰된 매물을 가격을 낮춰 다시 올리기.
// 2026-11 운영 기록에서 유찰된 장비를 같은 가격으로 다시 올리면 14%만 팔렸고, 25% 넘게 낮춘 경우는 34%가 팔렸다.
// 그래서 기본값을 30% 인하로 두고, 판매자가 고르거나 직접 고칠 수 있게 한다.

import {
  V2_EQUIPMENT,
  type V2EquipInstance,
  type V2EquipmentId,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import { mintListedEquipInstance } from "@/adventure/data/v2/v2EquipMint";
import type { Listing } from "./marketplaceShared";

/** 다시 올릴 때 고를 수 있는 인하 폭(%). 첫 값이 기본이다. */
export const RELIST_PRICE_CUTS = [30, 10, 0] as const;
export type RelistPriceCut = (typeof RELIST_PRICE_CUTS)[number];
export const RELIST_DEFAULT_CUT: RelistPriceCut = RELIST_PRICE_CUTS[0];

export function relistPrice(previousPrice: number, cutPct: number): number {
  const base = Math.max(1, Math.floor(Number(previousPrice) || 1));
  const cut = Math.min(99, Math.max(0, Number(cutPct) || 0));
  return Math.max(1, Math.floor((base * (100 - cut)) / 100));
}

export function relistCutLabel(cutPct: number): string {
  return cutPct > 0 ? `${cutPct}% 낮춤` : "같은 가격";
}

/** 유찰된 장비·재료 매물만 다시 올리기를 제공한다. */
export function canRelist(
  listing: Pick<Listing, "closedStatus" | "kind" | "isMine">,
): boolean {
  return (
    listing.isMine &&
    listing.closedStatus === "expired" &&
    (listing.kind === "equip" || listing.kind === "material")
  );
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** 매물에 담겨 돌아오는 값만 비교한다. 개체 번호와 잠금은 돌아올 때 새로 정해진다. */
function listedShape(instance: V2EquipInstance): string {
  return canonical({
    id: instance.id,
    roll: instance.roll,
    enhance: instance.enhance,
    craftQuality: instance.craftQuality,
    craftedBy: instance.craftedBy,
    stormRefined: instance.stormRefined,
  });
}

/**
 * 유찰되어 돌아온 장비를 가방에서 찾는다.
 * 잠갔거나 장착했거나 귀속된 개체, 돌아온 뒤 강화해 모습이 달라진 개체는 대상이 아니다.
 */
export function findRelistEquipInstance(
  owned: readonly V2EquipInstance[],
  equipped: Partial<Record<V2EquipSlot, string>>,
  listing: Pick<Listing, "itemId" | "instancePayload">,
): V2EquipInstance | null {
  if (!(listing.itemId in V2_EQUIPMENT)) return null;
  const expected = listedShape(
    mintListedEquipInstance(
      listing.itemId as V2EquipmentId,
      listing.instancePayload,
    ),
  );
  const equippedIids = new Set(Object.values(equipped));
  return (
    owned.find(
      (instance) =>
        instance.id === listing.itemId &&
        !instance.locked &&
        !instance.bound &&
        !instance.liberation &&
        !equippedIids.has(instance.iid) &&
        listedShape(instance) === expected,
    ) ?? null
  );
}

export type RelistTarget =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; reason: "missing_equip" | "missing_material"; holding?: number };

/** 다시 올리기 요청 본문. 등록 조건 검사는 기존 등록 API가 그대로 한다. */
export function relistRequest(
  listing: Pick<Listing, "kind" | "itemId" | "quantity" | "instancePayload">,
  inventory: {
    owned: readonly V2EquipInstance[];
    equipped: Partial<Record<V2EquipSlot, string>>;
    materials: Record<string, number>;
  },
  price: number,
  durationHours: number,
): RelistTarget {
  if (listing.kind === "equip") {
    const instance = findRelistEquipInstance(
      inventory.owned,
      inventory.equipped,
      listing,
    );
    if (!instance) return { ok: false, reason: "missing_equip" };
    return {
      ok: true,
      body: { durationHours, kind: "equip", iid: instance.iid, price },
    };
  }
  const holding = Math.max(0, Math.floor(inventory.materials[listing.itemId] ?? 0));
  if (holding < listing.quantity) {
    return { ok: false, reason: "missing_material", holding };
  }
  return {
    ok: true,
    body: {
      durationHours,
      kind: "material",
      itemId: listing.itemId,
      quantity: listing.quantity,
      price,
    },
  };
}
