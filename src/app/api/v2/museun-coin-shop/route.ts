import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
} from "@/lib/server/savesKv";
import {
  MUSEUN_CASH_ITEMS,
  MUSEUN_COIN_WALLET_KEY,
  addMuseunCashItem,
  isMuseunShopItemId,
  parseMuseunCashItems,
  parseMuseunCoinBalance,
  parseMuseunCoinShopPurchaseQuantity,
} from "@/adventure/data/v2/museunCashItems";
import { parseMuseunCosmetics } from "@/adventure/data/v2/museunCosmetics";

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
  if (process.env.NEXT_PUBLIC_MUSEUN_COIN_SHOP_OPEN !== "true") {
    return unavailable();
  }
  const userId = await ensureUser();
  if (!userId) return bad("unauthorized", 401);

  const [wallet, character] = await Promise.all([
    readSave(db, userId, MUSEUN_COIN_WALLET_KEY, {}),
    readSave<CharacterSave>(db, userId, "character.v2", {}),
  ]);
  return Response.json({
    ok: true,
    coins: parseMuseunCoinBalance(wallet),
    cashItems: parseMuseunCashItems(character.cashItems),
    cosmetics: parseMuseunCosmetics(character.museunCosmetics),
  });
}

export async function POST(req: Request) {
  if (process.env.NEXT_PUBLIC_MUSEUN_COIN_SHOP_OPEN !== "true") {
    return unavailable();
  }
  const userId = await ensureUser();
  if (!userId) return bad("unauthorized", 401);
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:museun-coin-shop:buy",
    userLimit: 30,
    ipLimit: 180,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: { itemId?: unknown; quantity?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return bad("invalid_json");
  }
  if (!isMuseunShopItemId(body.itemId)) return bad("invalid_item");
  const quantity = parseMuseunCoinShopPurchaseQuantity(body.quantity ?? 1);
  if (quantity === null) return bad("invalid_quantity");
  const itemId = body.itemId;
  const item = MUSEUN_CASH_ITEMS[itemId];
  const totalPrice = item.coinPrice * quantity;

  const result = await db.transaction(async (tx) => {
    // 게임 내 공통 잠금 순서에 맞춰 캐릭터를 먼저 잠근다.
    const character = await lockSaveForUpdate<CharacterSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const wallet = await lockSaveForUpdate<Record<string, unknown>>(
      tx,
      userId,
      MUSEUN_COIN_WALLET_KEY,
      {},
    );
    const currentCashItems = parseMuseunCashItems(character.cashItems);
    const coins = parseMuseunCoinBalance(wallet);
    if (coins < totalPrice) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "insufficient_coins",
          coins,
          requiredCoins: totalPrice,
        },
      };
    }

    const nextCoins = coins - totalPrice;
    const cashItems =
      item.delivery === "inventory"
        ? addMuseunCashItem(currentCashItems, itemId, quantity)
        : currentCashItems;
    const cosmetics = parseMuseunCosmetics(character.museunCosmetics);
    await upsertSave(tx, userId, "character.v2", {
      ...character,
      cashItems,
      museunCosmetics: cosmetics,
    });
    await upsertSave(tx, userId, MUSEUN_COIN_WALLET_KEY, {
      ...wallet,
      coins: nextCoins,
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
        delivery: item.delivery,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
