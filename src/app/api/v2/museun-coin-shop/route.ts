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
  isMuseunCashItemId,
  parseMuseunCashItems,
  parseMuseunCoinBalance,
} from "@/adventure/data/v2/museunCashItems";
import {
  isMuseunCosmeticItemId,
  parseMuseunCosmetics,
  unownedChromaNames,
  unlockMuseunCosmetic,
} from "@/adventure/data/v2/museunCosmetics";

type CharacterSave = {
  cashItems?: unknown;
  museunCosmetics?: unknown;
  [key: string]: unknown;
};

function bad(error: string, status = 400) {
  return Response.json({ ok: false, error }, { status });
}

export async function GET() {
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

  let body: { itemId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return bad("invalid_json");
  }
  if (!isMuseunCashItemId(body.itemId)) return bad("invalid_item");
  const itemId = body.itemId;
  const item = MUSEUN_CASH_ITEMS[itemId];

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
    const cosmeticUnlock = isMuseunCosmeticItemId(itemId)
      ? unlockMuseunCosmetic(character.museunCosmetics, itemId)
      : null;
    if (cosmeticUnlock?.alreadyOwned) {
      return {
        status: 409,
        body: {
          ok: false as const,
          error: "already_owned",
          coins: parseMuseunCoinBalance(wallet),
          cosmetics: cosmeticUnlock.state,
        },
      };
    }
    const currentCashItems = parseMuseunCashItems(character.cashItems);
    if (item.effect.kind === "chroma_name_box") {
      const remaining = unownedChromaNames(character.museunCosmetics).length;
      if (remaining === 0) {
        return {
          status: 409,
          body: {
            ok: false as const,
            error: "collection_complete",
            coins: parseMuseunCoinBalance(wallet),
            cashItems: currentCashItems,
            cosmetics: parseMuseunCosmetics(character.museunCosmetics),
          },
        };
      }
      if ((currentCashItems[itemId] ?? 0) >= remaining) {
        return {
          status: 409,
          body: {
            ok: false as const,
            error: "enough_boxes",
            coins: parseMuseunCoinBalance(wallet),
            cashItems: currentCashItems,
            cosmetics: parseMuseunCosmetics(character.museunCosmetics),
          },
        };
      }
    }
    const coins = parseMuseunCoinBalance(wallet);
    if (coins < item.coinPrice) {
      return {
        status: 400,
        body: { ok: false as const, error: "insufficient_coins", coins },
      };
    }

    const nextCoins = coins - item.coinPrice;
    const cashItems =
      item.delivery === "inventory"
        ? addMuseunCashItem(currentCashItems, itemId, 1)
        : currentCashItems;
    const cosmetics = cosmeticUnlock?.state ??
      parseMuseunCosmetics(character.museunCosmetics);
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
        coins: nextCoins,
        cashItems,
        cosmetics,
        delivery: item.delivery,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
