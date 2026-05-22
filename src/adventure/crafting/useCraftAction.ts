"use client";

import { ITEMS, rarityTextClass, type ItemId } from "@/adventure/data/items";
import { POTIONS } from "@/adventure/data/potions";
import { MATERIALS } from "@/adventure/data/materials";
import { craftTierSuffix } from "@/adventure/data/craftQuality";
import { recipeGoldCost, type Recipe } from "@/adventure/data/recipes";
import {
  craftErrorMessage,
  type CraftResult,
  type EquipPicks,
} from "@/adventure/crafting/types";
import type { useCrafting } from "@/adventure/crafting/useCrafting";
import type { useInventory } from "@/adventure/inventory/useInventory";
import { useRemoteSave } from "@/lib/storage/SaveProvider";
import type { NotificationKind, NotificationMeta } from "@/lib/notifications";

// 제작 — 서버 권위. 클라는 recipeId + quantity 만 보내고, 서버가 inventory.v2 / crafting.v2 를
// 잠그고 검증·적용(품질 등급 추첨 포함)한 새 값을 받아 in-memory state 를 replace.
// 사전 검사(재료/포션 한도)는 UX 용 — 라운드트립 전에 부족분을 안내. 권한은 서버가 갖는다.
export function useCraftAction(deps: {
  inventory: ReturnType<typeof useInventory>;
  crafting: ReturnType<typeof useCrafting>;
  /** 골드 사전검사용 — 현재 보유 골드. 권한은 서버. */
  gold: number;
  /** 제작 골드 차감이 반영된 character.v2 적용 — 잔액 갱신. */
  replaceCharacterFromSaved: (saved: unknown) => void;
  addNotification: (
    kind: NotificationKind,
    text: string,
    meta?: NotificationMeta,
  ) => void;
  grantTitle: (titleId: string) => void;
  /** craft_item 의뢰 진행도 보고 — 장비 제작 성공 시. 미지정 가능(서버 사이드 등). */
  recordCraft?: (itemId: ItemId) => void;
}) {
  const {
    inventory,
    crafting,
    gold,
    replaceCharacterFromSaved,
    addNotification,
    grantTitle,
    recordCraft,
  } = deps;
  const remote = useRemoteSave();

  const handleCraft = async (
    recipe: Recipe,
    quantity: number = 1,
    equipPicks?: EquipPicks,
  ) => {
    if (!Number.isInteger(quantity) || quantity < 1) return;

    // UX 용 사전 검사 — quantity 배 기준. 서버도 같은 검사를 다시 한다.
    for (const ing of recipe.ingredients) {
      const need = ing.count * quantity;
      if (ing.kind === "material") {
        if (inventory.materialCount(ing.materialId) < need) {
          addNotification(
            "info",
            `재료가 부족하다 — ${MATERIALS[ing.materialId].name} ${need}개 필요.`,
          );
          return;
        }
      } else {
        const have =
          (inventory.state.equipment[ing.itemId] ?? 0) +
          inventory.craftedTotalCount(ing.itemId) +
          inventory.droppedTotalCount(ing.itemId);
        if (have < need) {
          addNotification(
            "info",
            `재료가 부족하다 — ${ITEMS[ing.itemId].name} ${need}개 필요.`,
          );
          return;
        }
      }
    }
    if (recipe.result.kind === "potion") {
      const have = inventory.state.potions[recipe.result.potionId] ?? 0;
      const totalProduce = recipe.result.quantity * quantity;
      if (have + totalProduce > inventory.potionMax) {
        addNotification(
          "info",
          `${POTIONS[recipe.result.potionId].name}을(를) 더 들 수 없다.`,
        );
        return;
      }
    }
    const goldCost = recipeGoldCost(recipe) * quantity;
    if (gold < goldCost) {
      addNotification(
        "info",
        `골드가 부족하다 — ${goldCost.toLocaleString()} G 필요 (보유 ${gold.toLocaleString()}).`,
      );
      return;
    }

    // 서버가 inventory.v2 / crafting.v2 를 read-modify-write 하므로, 디바운스 큐의
    // 로컬 PATCH(방금 주운 드랍 등)를 먼저 flush 해 서버가 최신 값에서 차감하게 한다.
    // (안 하면 stale 값 적용 → replaceFromSaved 가 덮어쓰고 → 뒤늦은 PATCH 가 409→재시도로
    //  덮인 값을 다시 올려 드랍이 영구 유실. 마켓플레이스와 동일한 처리.)
    await remote.flush();
    let res: Response;
    try {
      res = await fetch("/api/craft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipeId: recipe.id,
          quantity,
          ...(equipPicks && Object.keys(equipPicks).length > 0
            ? { equipPicks }
            : {}),
        }),
      });
    } catch {
      addNotification("info", "통신 오류 — 잠시 후 다시 시도해 주세요.");
      return;
    }
    if (res.status === 401 || res.status === 410) return;
    const data = (await res.json().catch(() => null)) as
      | {
          ok: true;
          inventory: unknown;
          crafting: unknown;
          character: unknown;
          results: CraftResult[];
          goldSpent: number;
        }
      | { ok: false; error: string }
      | null;
    if (!data) {
      addNotification("info", "제작에 실패했다.");
      return;
    }
    if (data.ok === false) {
      addNotification("info", craftErrorMessage(data.error));
      return;
    }
    inventory.replaceFromSaved(data.inventory);
    crafting.replaceFromSaved(data.crafting);
    replaceCharacterFromSaved(data.character);

    // 알림 — 장비는 결과 회마다 개별(걸작/일반/불량 각각 한 줄), 포션은 같은 ID 끼리 묶어
    // 한 줄로 합산(품질 변동이 없으므로 줄여도 정보 손실 없음).
    const potionTotals = new Map<string, number>();
    for (const r of data.results) {
      if (r.kind === "equipment") {
        const item = ITEMS[r.itemId];
        const suffix = craftTierSuffix(r.tier);
        addNotification("item", `${item.name}${suffix}을(를) 만들었다.`, {
          highlight: {
            name: item.name + suffix,
            className: rarityTextClass(item),
          },
        });
        // 제작 등급 칭호 — 걸작(2): 명장 / 불량(-2): 불량품 제작자. 동일 칭호 중복 grant 는 idempotent.
        if (r.tier === 2) grantTitle("masterwork");
        if (r.tier === -2) grantTitle("botched");
        // craft_item 의뢰 진행도 — 장비 결과에 한해 누적.
        recordCraft?.(r.itemId);
      } else {
        potionTotals.set(
          r.potionId,
          (potionTotals.get(r.potionId) ?? 0) + r.quantity,
        );
      }
    }
    for (const [potionId, qty] of potionTotals) {
      const potion = POTIONS[potionId as keyof typeof POTIONS];
      addNotification(
        "item",
        qty > 1
          ? `${potion.name} ×${qty}을(를) 만들었다.`
          : `${potion.name}을(를) 만들었다.`,
      );
    }
  };

  return { handleCraft };
}
