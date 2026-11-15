// 행상 품목과 교환 품목의 이름. 규칙 모듈을 가볍게 두려고 카탈로그를 읽는 부분만 따로 뺐다.

import { V2_MATERIALS } from "@/adventure/data/v2/dungeonDrops";
import { FARM_ITEMS, type FarmItemId } from "./farm";
import { FISHING_CATCH_ITEMS, type FishingCatchItemId } from "./fishingStock";
import type { PeddlerCargoItem, PeddlerShopItem } from "./peddlerRules";

function sourceItemName(kind: "material" | "farm" | "fish", itemId: string): string {
  if (kind === "material") return V2_MATERIALS[itemId]?.name ?? itemId;
  if (kind === "farm") return FARM_ITEMS[itemId as FarmItemId]?.name ?? itemId;
  return FISHING_CATCH_ITEMS[itemId as FishingCatchItemId]?.name ?? itemId;
}

export function peddlerCargoItemName(item: PeddlerCargoItem): string {
  return sourceItemName(item.source, item.sourceItemId);
}

/** 교환 품목 이름. 여러 개를 주는 품목은 수량을 붙인다. */
export function peddlerShopItemName(item: PeddlerShopItem): string {
  const name = sourceItemName(item.output.kind, item.output.itemId);
  return item.output.count > 1 ? `${name} ${item.output.count}개` : name;
}
