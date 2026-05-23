export * from "./types";

import type { EquipItem } from "./types";
import { STARTER_ITEMS } from "./starter";
import { SKY_ITEMS } from "./sky";
import { STARLIT_ITEMS } from "./starlit";
import { HIDDEN_ITEMS } from "./hidden";
import { MIDGAME_ITEMS } from "./midgame";
import { COASTAL_ITEMS } from "./coastal";
import { WESTERN_ITEMS } from "./western";
import { DRAGONSCALE_ITEMS } from "./dragonscale";

export const ITEMS = {
  ...STARTER_ITEMS,
  ...SKY_ITEMS,
  ...STARLIT_ITEMS,
  ...HIDDEN_ITEMS,
  ...MIDGAME_ITEMS,
  ...COASTAL_ITEMS,
  ...WESTERN_ITEMS,
  ...DRAGONSCALE_ITEMS,
} as const;

export type ItemId = keyof typeof ITEMS;

const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
const NAME_TO_ID: Map<string, ItemId> = new Map(
  ITEM_IDS.map((id) => [ITEMS[id].name, id]),
);

// 장착돼 있던 EquipItem이 어느 ITEMS 엔트리인지 역추적. localStorage 저장 후
// 참조가 끊긴 인스턴스도 이름 매칭으로 식별, 이름은 고유라고 가정.
export function findItemId(item: EquipItem | null | undefined): ItemId | null {
  if (!item) return null;
  return NAME_TO_ID.get(item.name) ?? null;
}
