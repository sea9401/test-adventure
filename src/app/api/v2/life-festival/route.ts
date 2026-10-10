// GET  /api/v2/life-festival — 이번 주 생활 축제 현황(테마·주문·증표·점수·상점)
// POST /api/v2/life-festival — { action: "deliver", orderId, times, foodIds? } | { action: "buy", itemId }
//
// 잠금 순서: 생활 활동 사용자 행 → 축제 세이브 → 품목/지급 세이브. 재고 차감·회차 증가·점수 기록은
// 한 트랜잭션이라 연속 요청은 두 번째가 차감된 재고로 다시 검증된다.

import { db } from "@/db";
import {
  LIFE_FESTIVAL_DELIVERY_TIMES_MAX,
  LIFE_FESTIVAL_ORDER_BY_ID,
  LIFE_FESTIVAL_SHOP_ITEM_BY_ID,
  LIFE_FESTIVAL_SHOP_ITEMS,
  lifeFestivalRequirementLabel,
  type LifeFestivalShopItem,
} from "@/adventure/data/v2/lifeFestival";
import { MASTERY_CERTIFICATE_KEY } from "@/adventure/data/v2/masteryTower";
import { FARM_SAVE_KEY } from "@/adventure/v2/farm";
import {
  buyLifeFestivalShopItem,
  LIFE_FESTIVAL_SAVE_KEY,
  lifeFestivalDeliveryReward,
  lifeFestivalMultiplier,
  lifeFestivalOrdersForWeek,
  lifeFestivalThemeForWeek,
  lifeFestivalWeekEndsAt,
  parseLifeFestivalState,
  type LifeFestivalState,
} from "@/adventure/v2/lifeFestival";
import { LIFE_WORKSHOP_SAVE_KEY } from "@/adventure/v2/lifeWorkshop";
import {
  grantStaminaPotions,
  STAMINA_POTIONS_KEY,
} from "@/adventure/v2/staminaPotions";
import { kstWeekMondayKey } from "@/lib/kst";
import { ensureUser } from "@/lib/server/ensureUser";
import { grantTitleIfMissingInTx } from "@/lib/server/grantTitle";
import { lockLifeActivityUserForUpdate } from "@/lib/server/lifeActivityLock";
import {
  consumeLifeFestivalRequirement,
  heldLifeFestivalItems,
  LIFE_FESTIVAL_ITEM_SAVE_KEYS,
  lifeFestivalDishOptions,
  type SaveRecord,
} from "@/lib/server/lifeFestival/inventory";
import {
  addLifeFestivalScore,
  readLifeFestivalRanking,
} from "@/lib/server/lifeFestival/scores";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
  type DbExecutor,
} from "@/lib/server/savesKv";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Failure = { status: number; error: string };

function record(value: unknown): SaveRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as SaveRecord)
    : {};
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

async function buildView(executor: DbExecutor, userId: string, now: Date) {
  const weekId = kstWeekMondayKey(now);
  const [festivalRaw, character, workshop, farm, inventory, ranking] = await Promise.all([
    readSave(executor, userId, LIFE_FESTIVAL_SAVE_KEY, {}),
    readSave(executor, userId, LIFE_FESTIVAL_ITEM_SAVE_KEYS.character, {}),
    readSave(executor, userId, LIFE_FESTIVAL_ITEM_SAVE_KEYS.workshop, {}),
    readSave(executor, userId, LIFE_FESTIVAL_ITEM_SAVE_KEYS.farm, {}),
    readSave(executor, userId, LIFE_FESTIVAL_ITEM_SAVE_KEYS.inventory, {}),
    readLifeFestivalRanking(executor, weekId, userId, now),
  ]);
  const state = parseLifeFestivalState(festivalRaw, weekId);
  const saves = {
    character: record(character),
    workshop: record(workshop),
    farm: record(farm),
    inventory: record(inventory),
  };
  const orders = lifeFestivalOrdersForWeek(weekId);
  const theme = lifeFestivalThemeForWeek(weekId);
  return {
    weekId,
    endsAt: lifeFestivalWeekEndsAt(weekId).toISOString(),
    theme: {
      id: theme.id,
      name: theme.name,
      activity: theme.activity,
      activityName: theme.activityName,
      effectText: theme.effectText,
    },
    tokens: state.tokens,
    weeklyScore: ranking.me?.score ?? 0,
    myRank: ranking.me?.rank ?? null,
    orders: orders.map((order) => {
      const delivered = state.deliveries[order.id] ?? 0;
      return {
        id: order.id,
        pool: order.pool,
        requirement: order.requirement,
        label: lifeFestivalRequirementLabel(order.requirement),
        baseTokens: order.baseTokens,
        delivered,
        nextMultiplier: lifeFestivalMultiplier(delivered + 1),
        held: heldLifeFestivalItems(saves, order.requirement),
      };
    }),
    dishOptions: Object.fromEntries(
      orders.flatMap((order) =>
        order.requirement.kind === "dish"
          ? [[order.id, lifeFestivalDishOptions(saves.inventory, order.requirement)]]
          : [],
      ),
    ),
    shop: LIFE_FESTIVAL_SHOP_ITEMS.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      tokenCost: item.tokenCost,
      weeklyLimit: item.weeklyLimit,
      purchased: state.weeklyPurchases[item.id] ?? 0,
      owned: state.ownedOnceItemIds.includes(item.id),
    })),
  };
}

export type LifeFestivalView = Awaited<ReturnType<typeof buildView>>;

export async function GET() {
  const userId = await ensureUser();
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const view = await buildView(db, userId, new Date(Date.now()));
  return Response.json({ ok: true, ...view });
}

function parseTimes(raw: unknown): number | null {
  return typeof raw === "number" &&
    Number.isInteger(raw) &&
    raw >= 1 &&
    raw <= LIFE_FESTIVAL_DELIVERY_TIMES_MAX
    ? raw
    : null;
}

function parseFoodIds(raw: unknown): Record<string, number> | undefined | null {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const selection: Record<string, number> = {};
  for (const [foodId, amount] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0) return null;
    selection[foodId] = amount;
  }
  return selection;
}

async function lockFestival(tx: Tx, userId: string, weekId: string): Promise<LifeFestivalState> {
  return parseLifeFestivalState(
    await lockSaveForUpdate(tx, userId, LIFE_FESTIVAL_SAVE_KEY, {}),
    weekId,
  );
}

async function deliver(
  tx: Tx,
  userId: string,
  weekId: string,
  body: Record<string, unknown>,
): Promise<Failure | { gained: { tokens: number; score: number } }> {
  const times = parseTimes(body.times);
  if (times === null) return { status: 400, error: "invalid_times" };
  const foodIds = parseFoodIds(body.foodIds);
  if (foodIds === null) return { status: 400, error: "invalid_food_selection" };
  const orderId = typeof body.orderId === "string" ? body.orderId : "";
  const order = LIFE_FESTIVAL_ORDER_BY_ID.get(orderId);
  if (!order || !lifeFestivalOrdersForWeek(weekId).some((active) => active.id === order.id)) {
    return { status: 409, error: "order_not_active" };
  }

  // 잠금 순서: 사용자 행 → 품목 세이브 → 축제 세이브(우편 수령과 같이 축제 세이브를 마지막에).
  await lockLifeActivityUserForUpdate(tx, userId);
  const consumed = await consumeLifeFestivalRequirement(
    tx,
    userId,
    order.requirement,
    times,
    foodIds,
  );
  if (!consumed.ok) return { status: 409, error: consumed.error };
  const state = await lockFestival(tx, userId, weekId);

  const delivered = state.deliveries[order.id] ?? 0;
  const gained = lifeFestivalDeliveryReward(order.baseTokens, delivered, times);
  const next: LifeFestivalState = {
    ...state,
    tokens: state.tokens + gained.tokens,
    tokensEarnedTotal: state.tokensEarnedTotal + gained.tokens,
    deliveries: { ...state.deliveries, [order.id]: delivered + times },
  };
  await upsertSave(tx, userId, LIFE_FESTIVAL_SAVE_KEY, next);
  await addLifeFestivalScore(tx, { userId, weekId, score: gained.score, deliveries: times });
  return { gained };
}

// 지급 대상 세이브를 먼저 잠그고, 축제 세이브 검증이 끝난 뒤 실행할 쓰기를 돌려준다.
async function lockShopGrant(
  tx: Tx,
  userId: string,
  item: LifeFestivalShopItem,
  now: Date,
): Promise<() => Promise<unknown>> {
  const output = item.output;
  switch (output.kind) {
    case "finished": {
      const workshop = record(await lockSaveForUpdate(tx, userId, LIFE_WORKSHOP_SAVE_KEY, {}));
      const crafting = record(workshop.crafting);
      const balances = record(crafting.balances);
      return () =>
        upsertSave(tx, userId, LIFE_WORKSHOP_SAVE_KEY, {
          ...workshop,
          crafting: {
            ...crafting,
            balances: { ...balances, [output.itemId]: count(balances[output.itemId]) + output.count },
          },
        });
    }
    case "farm": {
      const farm = record(await lockSaveForUpdate(tx, userId, FARM_SAVE_KEY, {}));
      const inventory = record(farm.inventory);
      return () =>
        upsertSave(tx, userId, FARM_SAVE_KEY, {
          ...farm,
          inventory: { ...inventory, [output.itemId]: count(inventory[output.itemId]) + output.count },
        });
    }
    case "material": {
      const character = record(await lockSaveForUpdate(tx, userId, "character.v2", {}));
      const materials = record(character.materials);
      return () =>
        upsertSave(tx, userId, "character.v2", {
          ...character,
          materials: {
            ...materials,
            [output.materialId]: count(materials[output.materialId]) + output.count,
          },
        });
    }
    case "mastery_certificate": {
      const inventory = record(await lockSaveForUpdate(tx, userId, "inventory.v2", {}));
      return () =>
        upsertSave(tx, userId, "inventory.v2", {
          ...inventory,
          [MASTERY_CERTIFICATE_KEY]: count(inventory[MASTERY_CERTIFICATE_KEY]) + output.count,
        });
    }
    case "stamina_potion": {
      const raw = await lockSaveForUpdate(tx, userId, STAMINA_POTIONS_KEY, {});
      return () =>
        upsertSave(tx, userId, STAMINA_POTIONS_KEY, grantStaminaPotions(raw, output.count, { bound: true }));
    }
    case "title":
      // 칭호 기록 행을 먼저 잠가 우편 수령(칭호 → 축제 세이브)과 순서를 맞춘다.
      await lockSaveForUpdate(tx, userId, "adventure-log.v2", {});
      return () => grantTitleIfMissingInTx(tx, userId, output.titleId, now.getTime());
  }
}

async function buy(
  tx: Tx,
  userId: string,
  weekId: string,
  body: Record<string, unknown>,
  now: Date,
): Promise<Failure | { item: { id: string; name: string } }> {
  const item = LIFE_FESTIVAL_SHOP_ITEM_BY_ID.get(typeof body.itemId === "string" ? body.itemId : "");
  if (!item) return { status: 400, error: "unknown_item" };
  // 잠금 순서: 사용자 행 → 지급 대상 세이브 → 축제 세이브(마지막).
  await lockLifeActivityUserForUpdate(tx, userId);
  const applyGrant = await lockShopGrant(tx, userId, item, now);
  const state = await lockFestival(tx, userId, weekId);
  const result = buyLifeFestivalShopItem(state, item.id);
  if ("error" in result) return { status: 409, error: result.error };
  await upsertSave(tx, userId, LIFE_FESTIVAL_SAVE_KEY, result.state);
  await applyGrant();
  return { item: { id: item.id, name: item.name } };
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:life-festival",
    userLimit: 40,
    ipLimit: 200,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: Record<string, unknown>;
  try {
    body = record(await req.json());
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (body.action !== "deliver" && body.action !== "buy") {
    return Response.json({ ok: false, error: "invalid_action" }, { status: 400 });
  }

  const now = new Date(Date.now());
  const weekId = kstWeekMondayKey(now);
  const result = await db.transaction(async (tx) =>
    body.action === "deliver"
      ? deliver(tx, userId, weekId, body)
      : buy(tx, userId, weekId, body, now),
  );
  if ("error" in result) {
    return Response.json({ ok: false, error: result.error }, { status: result.status });
  }
  const view = await buildView(db, userId, now);
  return Response.json({ ok: true, ...result, view });
}
