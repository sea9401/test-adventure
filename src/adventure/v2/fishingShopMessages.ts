import type { CoinShopConsumableMessage } from "./useCoinShop";
import {
  FISHING_ABYSSAL_SUMMON_BAIT_ITEM_ID,
  FISHING_SEED_POUCH_ITEM_ID,
  FISHING_STAMINA_POTION_ITEM_ID,
} from "./fishingShop";

export const fishingShopConsumableMessage: CoinShopConsumableMessage = (
  itemId, response, succeeded,
) => {
  if (succeeded) {
    if (itemId === FISHING_ABYSSAL_SUMMON_BAIT_ITEM_ID) {
      return "심연어룡을 소환했다. 협동 보스에서 확인할 수 있다.";
    }
    if (itemId === FISHING_SEED_POUCH_ITEM_ID) {
      const pouch = response.seedPouch;
      const name = pouch && typeof pouch === "object" && "name" in pouch
        && typeof pouch.name === "string" ? pouch.name : "씨앗 주머니";
      return `${name}를 구매했다.`;
    }
    if (itemId === FISHING_STAMINA_POTION_ITEM_ID) {
      return "스태미나 회복약을 구매했다.";
    }
    return undefined;
  }
  if (response.error === "limit_reached") {
    return itemId === FISHING_STAMINA_POTION_ITEM_ID
      ? "이번 주 구매 한도에 도달했다."
      : "오늘 구매 한도에 도달했다.";
  }
  if (response.error === "boss_already_active") {
    return "이미 소환한 심연어룡이 활성 상태다.";
  }
  if (response.error === "boss_capacity_reached") {
    return "현재 소환된 심연어룡이 너무 많다. 잠시 후 다시 시도해 주세요.";
  }
  return undefined;
};
