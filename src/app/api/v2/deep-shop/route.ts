import { db } from "@/db";
import {
  DEEP_SHOP_ENTRIES,
  DEEP_SHOP_SAVE_KEY,
  parseDeepShopState,
  planDeepShopPurchase,
  type DeepShopPurchaseError,
  type DeepShopState,
} from "@/adventure/v2/deepShop";
import { mergeDrops } from "@/adventure/data/v2/dungeonDrops";
import { recordEconomyEventSoon } from "@/lib/server/economyLog";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";

// GET  /api/v2/deep-shop — 보유 심층 증표와 품목별 남은 주간 한도.
// POST /api/v2/deep-shop — { itemId, quantity } 구매. 증표와 골드를 함께 내고 재료를 받는다.
// 잠금 순서: character.v2 → deep-shop.v1 (던전 라우트의 증표 지급과 같은 순서).

type CharacterSave = Record<string, unknown> & {
  gold?: number;
  bankedGold?: number;
  materials?: Record<string, number>;
};

function wallet(character: CharacterSave) {
  return {
    gold: Math.max(0, Math.floor(Number(character.gold) || 0)),
    bankedGold: Math.max(0, Math.floor(Number(character.bankedGold) || 0)),
  };
}

function view(state: DeepShopState, character: CharacterSave) {
  return {
    ok: true as const,
    tokens: state.tokens,
    weekKey: state.weekKey,
    ...wallet(character),
    entries: DEEP_SHOP_ENTRIES.map((entry) => ({
      ...entry,
      remaining: Math.max(0, entry.weeklyLimit - (state.purchased[entry.itemId] ?? 0)),
    })),
  };
}

const ERROR_STATUS: Record<DeepShopPurchaseError, number> = {
  unknown_item: 400,
  invalid_quantity: 400,
  weekly_limit: 409,
  insufficient_tokens: 409,
  insufficient_gold: 409,
};

export async function GET() {
  const userId = await ensureUser();
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const [character, shopRaw] = await Promise.all([
    readSave<CharacterSave>(db, userId, "character.v2", {}),
    readSave<unknown>(db, userId, DEEP_SHOP_SAVE_KEY, {}),
  ]);
  return Response.json(view(parseDeepShopState(shopRaw), character));
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:deep-shop",
    userLimit: 60,
    ipLimit: 300,
    windowMs: 60_000,
  });
  if (limited) return limited;
  const body = (await req.json().catch(() => null)) as { itemId?: unknown; quantity?: unknown } | null;
  if (!body || typeof body !== "object") {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const result = await db.transaction(async (tx) => {
    const character = await lockSaveForUpdate<CharacterSave>(tx, userId, "character.v2", {});
    const state = parseDeepShopState(await lockSaveForUpdate<unknown>(tx, userId, DEEP_SHOP_SAVE_KEY, {}));
    const plan = planDeepShopPurchase(state, body.itemId, body.quantity, wallet(character));
    if (!plan.ok) {
      return {
        status: ERROR_STATUS[plan.error],
        body: { ...view(state, character), ok: false as const, error: plan.error },
        event: null,
      };
    }
    const nextCharacter: CharacterSave = {
      ...character,
      gold: plan.wallet.gold,
      bankedGold: plan.wallet.bankedGold,
      materials: mergeDrops(character.materials ?? {}, plan.materials),
    };
    await upsertSave(tx, userId, "character.v2", nextCharacter);
    await upsertSave(tx, userId, DEEP_SHOP_SAVE_KEY, plan.state);
    const [materialId, quantity] = Object.entries(plan.materials)[0];
    return {
      status: 200,
      body: { ...view(plan.state, nextCharacter), gained: plan.materials },
      event: { materialId, quantity, goldCost: plan.goldCost, tokenCost: plan.tokenCost },
    };
  });

  if (result.event) {
    recordEconomyEventSoon({
      userId,
      eventType: "sink.deep_shop.purchase",
      goldDelta: -result.event.goldCost,
      itemKind: "material",
      itemId: result.event.materialId,
      quantity: result.event.quantity,
      detail: { tokens: result.event.tokenCost },
    });
  }
  return Response.json(result.body, { status: result.status });
}
