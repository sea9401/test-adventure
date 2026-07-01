import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { grantTitleIfMissingInTx } from "@/lib/server/grantTitle";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  kstDailyKey,
  kstWeeklyKey,
} from "@/adventure/data/v2/v2RepeatQuests";
import {
  COOP_SHOP_ENTRIES,
  COOP_SHOP_ENTRY_BY_ID,
  COOP_SHOP_STATE_KEY,
  coopShopPurchaseCount,
  coopShopRelevantMaterialIds,
  isCoopShopLimitReached,
  parseCoopShopState,
  recordCoopShopPurchase,
  type CoopShopEntry,
  type CoopShopState,
} from "@/adventure/v2/coop/coopShop";
import {
  STAMINA_POTIONS_KEY,
  staminaPotionCount,
} from "@/adventure/v2/staminaPotions";

type CharSave = { materials?: unknown; [k: string]: unknown };

function parseMaterials(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const n = Math.floor(Number(v));
      if (Number.isFinite(n) && n > 0) out[k] = n;
    }
  }
  return out;
}

function materialSubset(materials: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of coopShopRelevantMaterialIds()) out[id] = materials[id] ?? 0;
  return out;
}

function limitView(state: CoopShopState): Record<
  string,
  { scope: "daily" | "weekly"; used: number; limit: number }
> {
  const out: Record<
    string,
    { scope: "daily" | "weekly"; used: number; limit: number }
  > = {};
  for (const entry of COOP_SHOP_ENTRIES) {
    if (!entry.limit) continue;
    out[entry.itemId] = {
      scope: entry.limit.scope,
      used: coopShopPurchaseCount(state, entry),
      limit: entry.limit.count,
    };
  }
  return out;
}

function hasCost(materials: Record<string, number>, entry: CoopShopEntry): boolean {
  return Object.entries(entry.cost.materials).every(
    ([id, need]) => (materials[id] ?? 0) >= need,
  );
}

function spendCost(
  materials: Record<string, number>,
  entry: CoopShopEntry,
): Record<string, number> {
  const next = { ...materials };
  for (const [id, need] of Object.entries(entry.cost.materials)) {
    const left = (next[id] ?? 0) - need;
    if (left > 0) next[id] = left;
    else delete next[id];
  }
  return next;
}

async function ownedShopTitleIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ value: savesKv.value })
    .from(savesKv)
    .where(and(eq(savesKv.userId, userId), eq(savesKv.key, "adventure-log.v2")))
    .limit(1);
  const raw = (rows[0]?.value as { titles?: unknown } | undefined)?.titles;
  const titles =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return COOP_SHOP_ENTRIES.filter((e) => e.output.kind === "title")
    .map((e) => (e.output.kind === "title" ? e.output.titleId : ""))
    .filter((id) => id && id in titles);
}

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const dailyKey = kstDailyKey(now);
  const weeklyKey = kstWeeklyKey(now);
  const [charSave, shopRaw, ownedTitleIds, staminaPotions] = await Promise.all([
    db
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(and(eq(savesKv.userId, userId), eq(savesKv.key, "character.v2")))
      .limit(1)
      .then((rows) => (rows[0]?.value ?? {}) as CharSave),
    db
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(and(eq(savesKv.userId, userId), eq(savesKv.key, COOP_SHOP_STATE_KEY)))
      .limit(1)
      .then((rows) => rows[0]?.value),
    ownedShopTitleIds(userId),
    db
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(and(eq(savesKv.userId, userId), eq(savesKv.key, STAMINA_POTIONS_KEY)))
      .limit(1)
      .then((rows) => staminaPotionCount(rows[0]?.value)),
  ]);
  const materials = parseMaterials(charSave.materials);
  const shop = parseCoopShopState(shopRaw, dailyKey, weeklyKey);
  return Response.json({
    ok: true,
    materials: materialSubset(materials),
    ownedTitleIds,
    staminaPotions,
    limits: limitView(shop),
  });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { itemId?: unknown };
  try {
    body = (await req.json()) as { itemId?: unknown };
  } catch {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const itemId = typeof body.itemId === "string" ? body.itemId : null;
  const entry = itemId ? COOP_SHOP_ENTRY_BY_ID.get(itemId) : undefined;
  if (!entry) {
    return Response.json({ ok: false, error: "unknown_item" }, { status: 400 });
  }

  const now = new Date();
  const dailyKey = kstDailyKey(now);
  const weeklyKey = kstWeeklyKey(now);

  const result = await db.transaction(async (tx) => {
    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const shopRaw = await lockSaveForUpdate<unknown>(
      tx,
      userId,
      COOP_SHOP_STATE_KEY,
      {},
    );
    const shop = parseCoopShopState(shopRaw, dailyKey, weeklyKey);
    if (isCoopShopLimitReached(shop, entry)) {
      return {
        status: 409,
        body: {
          ok: false as const,
          error: "limit_reached" as const,
          limits: limitView(shop),
        },
      };
    }

    const materials = parseMaterials(charSave.materials);
    if (!hasCost(materials, entry)) {
      return {
        status: 402,
        body: {
          ok: false as const,
          error: "insufficient_materials" as const,
          materials: materialSubset(materials),
        },
      };
    }

    if (entry.output.kind === "title") {
      const granted = await grantTitleIfMissingInTx(
        tx,
        userId,
        entry.output.titleId,
        Date.now(),
      );
      if (!granted) {
        return {
          status: 409,
          body: {
            ok: false as const,
            error: "already_owned" as const,
            materials: materialSubset(materials),
          },
        };
      }
    }

    let nextMaterials = spendCost(materials, entry);
    let staminaPotions: number | undefined;
    if (entry.output.kind === "material") {
      nextMaterials = {
        ...nextMaterials,
        [entry.output.materialId]:
          (nextMaterials[entry.output.materialId] ?? 0) + entry.output.count,
      };
    } else if (entry.output.kind === "stamina_potion") {
      const potSave = await lockSaveForUpdate<{ count: number }>(
        tx,
        userId,
        STAMINA_POTIONS_KEY,
        { count: 0 },
      );
      staminaPotions = staminaPotionCount(potSave) + entry.output.count;
      await upsertSave(tx, userId, STAMINA_POTIONS_KEY, {
        count: staminaPotions,
      });
    }

    const nextShop = recordCoopShopPurchase(shop, entry);
    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      materials: nextMaterials,
    });
    await upsertSave(tx, userId, COOP_SHOP_STATE_KEY, nextShop);

    return {
      status: 200,
      body: {
        ok: true as const,
        itemId: entry.itemId,
        materials: materialSubset(nextMaterials),
        limits: limitView(nextShop),
        ...(staminaPotions !== undefined ? { staminaPotions } : {}),
        ...(entry.output.kind === "title"
          ? { titleId: entry.output.titleId }
          : {}),
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
