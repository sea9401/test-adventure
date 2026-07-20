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

type CharacterSave = {
  cashItems?: unknown;
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
    const coins = parseMuseunCoinBalance(wallet);
    if (coins < item.coinPrice) {
      return {
        status: 400,
        body: { ok: false as const, error: "insufficient_coins", coins },
      };
    }

    const nextCoins = coins - item.coinPrice;
    const cashItems = addMuseunCashItem(character.cashItems, itemId, 1);
    await upsertSave(tx, userId, "character.v2", {
      ...character,
      cashItems,
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
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
