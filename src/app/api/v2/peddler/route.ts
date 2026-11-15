// GET  /api/v2/peddler — 행상 현황(교역로·우대 품목·실을 수 있는 품목·증표 교환)
// POST /api/v2/peddler — { action: "dispatch", routeId, hours, cargo } | { action: "claim", routeId }
//                        | { action: "buy", itemId, quantity }
//
// 잠금 순서: 사용자 행 → character.v2 → farm.v2 → fishing-stock.v1 → inventory.v2 → adventure-log.v2(칭호를 줄 때만)
// → 행상 세이브. 행상 세이브를 바꾸는 요청은 모두 사용자 행을 먼저 잠그므로, 그 뒤에 읽은 행상 상태는 같은
// 트랜잭션이 끝날 때까지 바뀌지 않는다.

import { db } from "@/db";
import { TITLES } from "@/adventure/data/titles";
import {
  PEDDLER_SAVE_KEY,
  buyPeddlerShopItem,
  claimPeddlerDispatch,
  parsePeddlerState,
  peddlerEarnedTitleIds,
  peddlerRouteCapacity,
  peddlerRouteRank,
  peddlerRouteUnlocked,
  peddlerTotalRank,
  startPeddlerDispatch,
  type PeddlerState,
} from "@/adventure/v2/peddler";
import { peddlerCargoItemName, peddlerShopItemName } from "@/adventure/v2/peddlerCargoNames";
import type { PeddlerClaimView, PeddlerViewData } from "@/adventure/v2/peddlerClient";
import {
  PEDDLER_REQUIRED_LIFE_LEVEL,
  PEDDLER_ROUTES,
  PEDDLER_SHOP_ITEMS,
  isPeddlerDispatchHours,
  isPeddlerRouteId,
  peddlerCargoItem,
  peddlerNextRankAt,
  peddlerPreferredItemIds,
  peddlerShopItem,
  type PeddlerRouteId,
  type PeddlerShopItemId,
} from "@/adventure/v2/peddlerRules";
import { kstWeekMondayKey } from "@/lib/kst";
import { ensureUser } from "@/lib/server/ensureUser";
import { grantTitleIfMissingInTx } from "@/lib/server/grantTitle";
import { lockLifeActivityUserForUpdate } from "@/lib/server/lifeActivityLock";
import { readLifeLevels } from "@/lib/server/lifeMajor";
import {
  PEDDLER_ITEM_SAVE_KEYS,
  consumePeddlerCargo,
  lockPeddlerShopGrant,
  parsePeddlerCargo,
  peddlerCargoHoldings,
} from "@/lib/server/peddler/cargo";
import { lockSaveForUpdate, readSave, upsertSave, type DbExecutor } from "@/lib/server/savesKv";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Failure = { status: number; error: string };

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function fail(status: number, error: string): Failure {
  return { status, error };
}

async function lifeLevelReached(executor: DbExecutor, userId: string): Promise<boolean> {
  const levels = await readLifeLevels(executor, userId);
  return Object.values(levels).some((level) => level >= PEDDLER_REQUIRED_LIFE_LEVEL);
}

async function buildView(executor: DbExecutor, userId: string, now: Date): Promise<PeddlerViewData> {
  const weekId = kstWeekMondayKey(now);
  // 트랜잭션 executor 로도 불리므로 한 연결에 쿼리를 겹쳐 보내지 않게 차례로 읽는다.
  const state = parsePeddlerState(await readSave(executor, userId, PEDDLER_SAVE_KEY, {}), weekId);
  const material = await readSave(executor, userId, PEDDLER_ITEM_SAVE_KEYS.material, {});
  const farm = await readSave(executor, userId, PEDDLER_ITEM_SAVE_KEYS.farm, {});
  const fish = await readSave(executor, userId, PEDDLER_ITEM_SAVE_KEYS.fish, {});
  const dish = await readSave(executor, userId, PEDDLER_ITEM_SAVE_KEYS.dish, {});
  // 한 번이라도 보낸 계정은 레벨을 다시 확인하지 않는다.
  const unlocked = state.dispatchCount > 0 || (await lifeLevelReached(executor, userId));
  return {
    now: now.getTime(),
    weekId,
    weekEndsAt: new Date(Date.parse(`${weekId}T00:00:00+09:00`) + WEEK_MS).toISOString(),
    unlocked,
    tokens: state.tokens,
    tokenCarry: state.tokenCarry,
    totalRank: peddlerTotalRank(state),
    routes: PEDDLER_ROUTES.map((route) => {
      const rank = peddlerRouteRank(state, route.id);
      return {
        id: route.id,
        name: route.name,
        unlocked: peddlerRouteUnlocked(state, route.id),
        rank,
        standingPoints: state.routes[route.id].standingPoints,
        nextRankAt: peddlerNextRankAt(rank),
        capacity: peddlerRouteCapacity(state, route.id),
        preferred: peddlerPreferredItemIds(weekId, route.id).map((id) => ({
          id,
          name: peddlerCargoItemName(peddlerCargoItem(id)!),
        })),
        dispatch: state.routes[route.id].dispatch,
      };
    }),
    cargo: peddlerCargoHoldings({ material, farm, fish, dish }).map((item) => ({
      id: item.id,
      group: item.group,
      name: item.name,
      points: item.points,
      held: item.held,
    })),
    shop: PEDDLER_SHOP_ITEMS.map((item) => ({
      id: item.id,
      name: peddlerShopItemName(item),
      tokenCost: item.tokenCost,
      weeklyLimit: item.weeklyLimit,
      purchased: state.shop.purchases[item.id] ?? 0,
    })),
  };
}

export async function GET() {
  const userId = await ensureUser();
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const view = await buildView(db, userId, new Date(Date.now()));
  return Response.json({ ok: true, ...view });
}

async function lockPeddler(tx: Tx, userId: string, weekId: string): Promise<PeddlerState> {
  return parsePeddlerState(await lockSaveForUpdate(tx, userId, PEDDLER_SAVE_KEY, {}), weekId);
}

async function dispatch(
  tx: Tx,
  userId: string,
  weekId: string,
  body: Record<string, unknown>,
  now: number,
): Promise<Failure | { dispatched: { routeId: PeddlerRouteId; tokens: number; readyAt: number } }> {
  const routeId = body.routeId;
  if (!isPeddlerRouteId(routeId)) return fail(400, "invalid_route");
  const hours = body.hours;
  if (!isPeddlerDispatchHours(hours)) return fail(400, "invalid_hours");
  const lines = parsePeddlerCargo(body.cargo);
  if (!lines) return fail(400, "invalid_cargo");

  await lockLifeActivityUserForUpdate(tx, userId);
  const preferredIds = new Set(peddlerPreferredItemIds(weekId, routeId));
  const input = {
    routeId,
    hours,
    points: lines.reduce((sum, line) => sum + line.points * line.quantity, 0),
    preferredPoints: lines.reduce(
      (sum, line) => sum + (preferredIds.has(line.id) ? line.points * line.quantity : 0),
      0,
    ),
    now,
  };

  // 산물을 건드리기 전에 행상 쪽 조건부터 본다.
  const before = parsePeddlerState(await readSave(tx, userId, PEDDLER_SAVE_KEY, {}), weekId);
  if (before.dispatchCount === 0 && !(await lifeLevelReached(tx, userId))) {
    return fail(409, "life_level_required");
  }
  const preview = startPeddlerDispatch(before, input);
  if ("error" in preview) return fail(409, preview.error);

  if (!(await consumePeddlerCargo(tx, userId, lines))) return fail(409, "not_enough_items");
  const started = startPeddlerDispatch(await lockPeddler(tx, userId, weekId), input);
  if ("error" in started) throw new Error(`peddler dispatch changed under lock: ${started.error}`);
  await upsertSave(tx, userId, PEDDLER_SAVE_KEY, started.state);
  return {
    dispatched: { routeId, tokens: started.tokens, readyAt: started.state.routes[routeId].dispatch!.readyAt },
  };
}

async function claim(
  tx: Tx,
  userId: string,
  weekId: string,
  body: Record<string, unknown>,
  now: number,
): Promise<Failure | { claimed: PeddlerClaimView }> {
  const routeId = body.routeId;
  if (!isPeddlerRouteId(routeId)) return fail(400, "invalid_route");

  await lockLifeActivityUserForUpdate(tx, userId);
  const before = parsePeddlerState(await readSave(tx, userId, PEDDLER_SAVE_KEY, {}), weekId);
  const preview = claimPeddlerDispatch(before, routeId, now);
  if ("error" in preview) return fail(409, preview.error);

  const earnedBefore = peddlerEarnedTitleIds(preview.totalRankBefore);
  const newTitleIds = peddlerEarnedTitleIds(preview.totalRankAfter).filter((id) => !earnedBefore.includes(id));
  // 칭호 기록 행을 행상 세이브보다 먼저 잠근다.
  if (newTitleIds.length > 0) await lockSaveForUpdate(tx, userId, "adventure-log.v2", {});

  const result = claimPeddlerDispatch(await lockPeddler(tx, userId, weekId), routeId, now);
  if ("error" in result) throw new Error(`peddler claim changed under lock: ${result.error}`);
  await upsertSave(tx, userId, PEDDLER_SAVE_KEY, result.state);
  for (const titleId of newTitleIds) await grantTitleIfMissingInTx(tx, userId, titleId, now);
  return {
    claimed: {
      routeId,
      tokens: result.tokens,
      points: result.points,
      rankBefore: result.rankBefore,
      rankAfter: result.rankAfter,
      titleNames: newTitleIds.map((id) => TITLES[id]?.name ?? id),
    },
  };
}

async function buy(
  tx: Tx,
  userId: string,
  weekId: string,
  body: Record<string, unknown>,
): Promise<Failure | { bought: { id: PeddlerShopItemId; name: string; quantity: number } }> {
  const item = peddlerShopItem(body.itemId);
  if (!item) return fail(400, "unknown_item");
  // 수량 형식은 세이브와 무관하므로 잠그기 전에 거른다.
  const shape = buyPeddlerShopItem(parsePeddlerState({}, weekId), item.id, body.quantity);
  if ("error" in shape && shape.error === "invalid_quantity") return fail(400, "invalid_quantity");
  const quantity = body.quantity as number;

  await lockLifeActivityUserForUpdate(tx, userId);
  const applyGrant = await lockPeddlerShopGrant(tx, userId, item, quantity);
  const result = buyPeddlerShopItem(await lockPeddler(tx, userId, weekId), item.id, quantity);
  if ("error" in result) return fail(409, result.error);
  await upsertSave(tx, userId, PEDDLER_SAVE_KEY, result.state);
  await applyGrant();
  return { bought: { id: item.id, name: peddlerShopItemName(item), quantity } };
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:peddler",
    userLimit: 40,
    ipLimit: 200,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const action = body.action;
  if (action !== "dispatch" && action !== "claim" && action !== "buy") {
    return Response.json({ ok: false, error: "invalid_action" }, { status: 400 });
  }

  const now = new Date(Date.now());
  const weekId = kstWeekMondayKey(now);
  const result = await db.transaction(async (tx) => {
    if (action === "dispatch") return dispatch(tx, userId, weekId, body, now.getTime());
    if (action === "claim") return claim(tx, userId, weekId, body, now.getTime());
    return buy(tx, userId, weekId, body);
  });
  if ("error" in result) {
    return Response.json({ ok: false, error: result.error }, { status: result.status });
  }
  const view = await buildView(db, userId, now);
  return Response.json({ ok: true, ...result, view });
}
