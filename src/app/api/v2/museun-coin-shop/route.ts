import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { canAccessMuseunCoinShop } from "@/lib/server/museunCoinShopAccess";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
} from "@/lib/server/savesKv";
import {
  MUSEUN_CASH_ITEMS,
  addMuseunCashItem,
  isMuseunShopItemId,
  parseMuseunCashItems,
  parseMuseunCoinShopPurchaseQuantity,
} from "@/adventure/data/v2/museunCashItems";
import {
  getMuseunCoinBalance,
  spendMuseunCoins,
} from "@/lib/server/museunCoinAccount";
import { parseMuseunCosmetics } from "@/adventure/data/v2/museunCosmetics";
import {
  PROFILE_BADGE_STAND_ITEM_ID,
  ownsProfileBadgeStand,
} from "@/adventure/profile/profileShowcase";
import {
  GROWTH_LEAP_PACKAGE_ITEM_ID,
  GROWTH_LEAP_PACKAGE_POTIONS,
  GROWTH_LEAP_SAVE_KEY,
  MONTHLY_STAMINA_BUNDLE_ITEM_ID,
  MONTHLY_STAMINA_BUNDLE_POTIONS,
  activateGrowthLeap,
  buyMonthlyStaminaBundle,
  growthLeapShopView,
} from "@/adventure/data/v2/growthLeap";
import {
  STAMINA_POTIONS_KEY,
  grantStaminaPotions,
} from "@/adventure/v2/staminaPotions";

type CharacterSave = {
  cashItems?: unknown;
  museunCosmetics?: unknown;
  [key: string]: unknown;
};

function bad(error: string, status = 400) {
  return Response.json({ ok: false, error }, { status });
}

function unavailable() {
  return new Response(null, { status: 404 });
}

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return process.env.NEXT_PUBLIC_MUSEUN_COIN_SHOP_OPEN === "true"
      ? bad("unauthorized", 401)
      : unavailable();
  }
  if (!(await canAccessMuseunCoinShop(userId))) return unavailable();

  const [balance, character, growthLeap] = await Promise.all([
    getMuseunCoinBalance(db, userId),
    readSave<CharacterSave>(db, userId, "character.v2", {}),
    readSave(db, userId, GROWTH_LEAP_SAVE_KEY, {}),
  ]);
  return Response.json({
    ok: true,
    coins: balance.coins,
    cashItems: parseMuseunCashItems(character.cashItems),
    cosmetics: parseMuseunCosmetics(character.museunCosmetics),
    profileBadgeStandOwned: ownsProfileBadgeStand(character),
    ...growthLeapShopView(growthLeap, Date.now()),
  });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return process.env.NEXT_PUBLIC_MUSEUN_COIN_SHOP_OPEN === "true"
      ? bad("unauthorized", 401)
      : unavailable();
  }
  if (!(await canAccessMuseunCoinShop(userId))) return unavailable();
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:museun-coin-shop:buy",
    userLimit: 30,
    ipLimit: 180,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: { itemId?: unknown; quantity?: unknown; purchaseId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return bad("invalid_json");
  }
  if (!isMuseunShopItemId(body.itemId)) return bad("invalid_item");
  const quantity = parseMuseunCoinShopPurchaseQuantity(body.quantity ?? 1);
  if (quantity === null) return bad("invalid_quantity");
  if (
    body.purchaseId !== undefined &&
    (typeof body.purchaseId !== "string" ||
      !/^[A-Za-z0-9_-]{8,80}$/.test(body.purchaseId))
  ) {
    return bad("invalid_purchase_id");
  }
  const itemId = body.itemId;
  const item = MUSEUN_CASH_ITEMS[itemId];
  if (
    (item.delivery === "permanent" || item.delivery === "bundle") &&
    quantity !== 1
  ) {
    return bad("invalid_quantity");
  }
  const totalPrice = item.coinPrice * quantity;
  const now = Date.now();
  const purchaseId = body.purchaseId ?? randomUUID();

  const result = await db.transaction(async (tx) => {
    // 게임 내 공통 잠금 순서에 맞춰 캐릭터를 먼저 잠근다.
    const character = await lockSaveForUpdate<CharacterSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const currentCashItems = parseMuseunCashItems(character.cashItems);
    if (
      itemId === PROFILE_BADGE_STAND_ITEM_ID &&
      ownsProfileBadgeStand(character)
    ) {
      return {
        status: 400,
        body: { ok: false as const, error: "already_owned" },
      };
    }
    if (item.delivery === "bundle") {
      const growthLeap = await lockSaveForUpdate(
        tx,
        userId,
        GROWTH_LEAP_SAVE_KEY,
        {},
      );
      const purchase =
        itemId === MONTHLY_STAMINA_BUNDLE_ITEM_ID
          ? buyMonthlyStaminaBundle(growthLeap, now)
          : activateGrowthLeap(growthLeap, now);
      if (!purchase.ok) {
        return {
          status: 409,
          body: { ok: false as const, error: purchase.error },
        };
      }
      const spend = await spendMuseunCoins(tx, {
        userId,
        coins: totalPrice,
        eventKey: `shop:${purchaseId}`,
        kind: "shop_purchase",
        sourceId: itemId,
        detail: { quantity },
      });
      if (!spend.ok) {
        return {
          status: 400,
          body: {
            ok: false as const,
            error: "insufficient_coins",
            coins: spend.coins,
            requiredCoins: totalPrice,
          },
        };
      }
      const nextCoins = spend.coins;
      const currentPotions = await lockSaveForUpdate(
        tx,
        userId,
        STAMINA_POTIONS_KEY,
        { count: 0, boundCount: 0 },
      );
      const potionGrant =
        itemId === MONTHLY_STAMINA_BUNDLE_ITEM_ID
          ? MONTHLY_STAMINA_BUNDLE_POTIONS
          : GROWTH_LEAP_PACKAGE_POTIONS;
      const potions = grantStaminaPotions(currentPotions, potionGrant, {
        bound: true,
      });
      if (spend.duplicate) {
        return {
          status: 200,
          body: {
            ok: true as const,
            itemId,
            itemName: item.name,
            quantity: 1,
            totalPrice,
            coins: nextCoins,
            cashItems: currentCashItems,
            cosmetics: parseMuseunCosmetics(character.museunCosmetics),
            profileBadgeStandOwned: ownsProfileBadgeStand(character),
            delivery: item.delivery,
            duplicate: true as const,
            ...growthLeapShopView(growthLeap, now),
          },
        };
      }
      let cashItems = currentCashItems;
      if (itemId === GROWTH_LEAP_PACKAGE_ITEM_ID) {
        cashItems = addMuseunCashItem(cashItems, "chroma_name_box", 1);
        cashItems = addMuseunCashItem(cashItems, "profile_border_box", 1);
        await upsertSave(tx, userId, "character.v2", {
          ...character,
          cashItems,
        });
      }
      await upsertSave(tx, userId, GROWTH_LEAP_SAVE_KEY, purchase.state);
      await upsertSave(tx, userId, STAMINA_POTIONS_KEY, potions);
      return {
        status: 200,
        body: {
          ok: true as const,
          itemId,
          itemName: item.name,
          quantity: 1,
          totalPrice,
          coins: nextCoins,
          cashItems,
          cosmetics: parseMuseunCosmetics(character.museunCosmetics),
          profileBadgeStandOwned: ownsProfileBadgeStand(character),
          delivery: item.delivery,
          ...growthLeapShopView(purchase.state, now),
        },
      };
    }

    const spend = await spendMuseunCoins(tx, {
      userId,
      coins: totalPrice,
      eventKey: `shop:${purchaseId}`,
      kind: "shop_purchase",
      sourceId: itemId,
      detail: { quantity },
    });
    if (!spend.ok) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "insufficient_coins",
          coins: spend.coins,
          requiredCoins: totalPrice,
        },
      };
    }
    const nextCoins = spend.coins;
    if (spend.duplicate) {
      return {
        status: 200,
        body: {
          ok: true as const,
          itemId,
          itemName: item.name,
          quantity,
          totalPrice,
          coins: nextCoins,
          cashItems: currentCashItems,
          cosmetics: parseMuseunCosmetics(character.museunCosmetics),
          profileBadgeStandOwned: ownsProfileBadgeStand(character),
          delivery: item.delivery,
          duplicate: true as const,
        },
      };
    }
    const cashItems =
      item.delivery === "inventory"
        ? addMuseunCashItem(currentCashItems, itemId, quantity)
        : currentCashItems;
    const cosmetics = parseMuseunCosmetics(character.museunCosmetics);
    const profileBadgeStandOwned =
      itemId === PROFILE_BADGE_STAND_ITEM_ID
        ? true
        : ownsProfileBadgeStand(character);
    await upsertSave(tx, userId, "character.v2", {
      ...character,
      cashItems,
      museunCosmetics: cosmetics,
      ...(profileBadgeStandOwned ? { profileBadgeStandOwned: true } : {}),
    });
    return {
      status: 200,
      body: {
        ok: true as const,
        itemId,
        itemName: item.name,
        quantity,
        totalPrice,
        coins: nextCoins,
        cashItems,
        cosmetics,
        profileBadgeStandOwned,
        delivery: item.delivery,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
