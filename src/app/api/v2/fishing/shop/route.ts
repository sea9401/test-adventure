// 낚시 코인 상점 — 낚시 코인(fishing-wallet.v1)으로 칭호/도구/소비품 구매.
//
// GET  /api/v2/fishing/shop — { coins, ownedTitleIds, progression } (상점 UI 초기 상태).
// POST /api/v2/fishing/shop — body { titleId } | { itemId } | { gearKind, gearId, action } 구매.
//   1) 카탈로그 가격 조회 (미등재 → 400)
//   2) 트랜잭션: fishing-wallet.v1 잠금 → 코인 검증 → 칭호 부여(idempotent) → 코인 차감
//      - 코인 부족 → 402 (지급/부여 없음)
//      - 이미 보유 → 409 (차감 없음)
// 락 순서:
//   칭호/소비품: fishing-wallet.v1 → adventure-log.v2 또는 stamina-potions.v1
//   도구: fishing-progress.v1 → fishing-wallet.v1
// 정산(seasonRewards)은 fishing_seasons → fishing-wallet 순이고 adventure-log 를 안 잡으므로 순환 대기 없음.

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import {
  FISHING_WALLET_KEY,
  walletCoins,
  type FishingWallet,
} from "@/lib/server/fishing/coins";
import { grantTitleIfMissingInTx } from "@/lib/server/grantTitle";
import {
  FISHING_SHOP_TITLES,
  fishingShopConsumablePriceFor,
  fishingShopPriceFor,
} from "@/adventure/v2/fishingShop";
import {
  STAMINA_POTIONS_KEY,
  staminaPotionCount,
} from "@/adventure/v2/staminaPotions";
import {
  FISHING_LURES,
  FISHING_PROGRESS_KEY,
  FISHING_RODS,
  buyFishingLure,
  buyFishingRod,
  emptyFishingProgression,
  equipFishingLure,
  equipFishingRod,
  fishingGearPrice,
  fishingProgressionView,
  parseFishingProgression,
  type FishingLureId,
  type FishingProgressionState,
  type FishingRodId,
} from "@/adventure/v2/fishingProgression";

type GearKind = "rod" | "lure";
type GearAction = "buy" | "equip";

async function ownedShopTitleIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ value: savesKv.value })
    .from(savesKv)
    .where(and(eq(savesKv.userId, userId), eq(savesKv.key, "adventure-log.v2")))
    .limit(1);
  const raw = (rows[0]?.value as { titles?: unknown } | undefined)?.titles;
  const titles =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return FISHING_SHOP_TITLES.map((t) => t.titleId).filter((id) => id in titles);
}

function parseGearKind(raw: unknown): GearKind | null {
  return raw === "rod" || raw === "lure" ? raw : null;
}

function parseGearAction(raw: unknown): GearAction | null {
  if (raw === undefined || raw === null || raw === "buy") return "buy";
  return raw === "equip" ? "equip" : null;
}

function isOwnedGear(
  state: FishingProgressionState,
  kind: GearKind,
  id: string,
): boolean {
  return kind === "rod"
    ? state.ownedRods.includes(id as FishingRodId)
    : state.ownedLures.includes(id as FishingLureId);
}

function equipGear(
  state: FishingProgressionState,
  kind: GearKind,
  id: string,
): FishingProgressionState | null {
  return kind === "rod"
    ? equipFishingRod(state, id as FishingRodId)
    : equipFishingLure(state, id as FishingLureId);
}

function buyGearState(
  state: FishingProgressionState,
  kind: GearKind,
  id: string,
): FishingProgressionState {
  return kind === "rod"
    ? buyFishingRod(state, id as FishingRodId)
    : buyFishingLure(state, id as FishingLureId);
}

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const [coins, ownedTitleIds, staminaPotions, progression] = await Promise.all([
    db
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(and(eq(savesKv.userId, userId), eq(savesKv.key, FISHING_WALLET_KEY)))
      .limit(1)
      .then((rows) => walletCoins(rows[0]?.value)),
    ownedShopTitleIds(userId),
    db
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(and(eq(savesKv.userId, userId), eq(savesKv.key, STAMINA_POTIONS_KEY)))
      .limit(1)
      .then((rows) => staminaPotionCount(rows[0]?.value)),
    readSave(db, userId, FISHING_PROGRESS_KEY, emptyFishingProgression()).then(
      (raw) => fishingProgressionView(parseFishingProgression(raw)),
    ),
  ]);
  return Response.json({
    ok: true,
    coins,
    ownedTitleIds,
    staminaPotions,
    progression,
  });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: {
    titleId?: unknown;
    itemId?: unknown;
    gearKind?: unknown;
    gearId?: unknown;
    action?: unknown;
  };
  try {
    body = (await req.json()) as {
      titleId?: unknown;
      itemId?: unknown;
      gearKind?: unknown;
      gearId?: unknown;
      action?: unknown;
    };
  } catch {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const hasGearPayload =
    body.gearKind !== undefined ||
    body.gearId !== undefined ||
    body.action !== undefined;
  if (hasGearPayload) {
    const gearKind = parseGearKind(body.gearKind);
    const gearId = typeof body.gearId === "string" ? body.gearId : null;
    const action = parseGearAction(body.action);
    if (!gearKind || !gearId || !action) {
      return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
    }
    return buyFishingGear(userId, gearKind, gearId, action);
  }

  // 소비템 구매(itemId) — 칭호와 별개 분기. 반복 구매(보유 상태 없음).
  const itemId = typeof body.itemId === "string" ? body.itemId : null;
  if (itemId) {
    return buyConsumable(userId, itemId);
  }

  const titleId = typeof body.titleId === "string" ? body.titleId : null;
  if (!titleId) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const price = fishingShopPriceFor(titleId);
  if (price === undefined) {
    return Response.json(
      { ok: false, error: "unknown_title" },
      { status: 400 },
    );
  }

  const outcome = await db.transaction(async (tx) => {
    const wallet = await lockSaveForUpdate<FishingWallet>(
      tx,
      userId,
      FISHING_WALLET_KEY,
      { coins: 0 },
    );
    const coins = walletCoins(wallet);
    if (coins < price) return { kind: "insufficient" as const, coins };
    // 부여 먼저(소유 확인) — 이미 보유면 차감 없이 종료.
    const granted = await grantTitleIfMissingInTx(tx, userId, titleId, Date.now());
    if (!granted) return { kind: "owned" as const, coins };
    const coinBalance = coins - price;
    await upsertSave(tx, userId, FISHING_WALLET_KEY, { coins: coinBalance });
    return { kind: "ok" as const, coinBalance };
  });

  if (outcome.kind === "insufficient") {
    return Response.json(
      { ok: false, error: "insufficient_coins", coins: outcome.coins },
      { status: 402 },
    );
  }
  if (outcome.kind === "owned") {
    return Response.json(
      { ok: false, error: "already_owned", coins: outcome.coins },
      { status: 409 },
    );
  }
  return Response.json({ ok: true, titleId, coins: outcome.coinBalance });
}

// 낚시 도구 구매/장착 — 진행도 키를 먼저 잠근 뒤, 신규 구매일 때만 지갑을 잠근다.
async function buyFishingGear(
  userId: string,
  gearKind: GearKind,
  gearId: string,
  action: GearAction,
): Promise<Response> {
  const price = fishingGearPrice(gearKind, gearId);
  const exists =
    gearKind === "rod" ? gearId in FISHING_RODS : gearId in FISHING_LURES;
  if (price === null || !exists) {
    return Response.json({ ok: false, error: "unknown_gear" }, { status: 400 });
  }

  const outcome = await db.transaction(async (tx) => {
    const progress = parseFishingProgression(
      await lockSaveForUpdate(
        tx,
        userId,
        FISHING_PROGRESS_KEY,
        emptyFishingProgression(),
      ),
    );
    const owned = isOwnedGear(progress, gearKind, gearId);
    if (action === "equip" || owned) {
      const next = equipGear(progress, gearKind, gearId);
      if (!next) {
        return {
          kind: "not_owned" as const,
          progression: fishingProgressionView(progress),
        };
      }
      await upsertSave(tx, userId, FISHING_PROGRESS_KEY, next);
      return {
        kind: "ok" as const,
        progression: fishingProgressionView(next),
      };
    }

    const wallet = await lockSaveForUpdate<FishingWallet>(
      tx,
      userId,
      FISHING_WALLET_KEY,
      { coins: 0 },
    );
    const coins = walletCoins(wallet);
    if (coins < price) {
      return {
        kind: "insufficient" as const,
        coins,
        progression: fishingProgressionView(progress),
      };
    }
    const next = buyGearState(progress, gearKind, gearId);
    await upsertSave(tx, userId, FISHING_PROGRESS_KEY, next);
    const coinBalance = coins - price;
    await upsertSave(tx, userId, FISHING_WALLET_KEY, { coins: coinBalance });
    return {
      kind: "ok" as const,
      coins: coinBalance,
      progression: fishingProgressionView(next),
    };
  });

  if (outcome.kind === "not_owned") {
    return Response.json(
      {
        ok: false,
        error: "not_owned",
        progression: outcome.progression,
      },
      { status: 404 },
    );
  }
  if (outcome.kind === "insufficient") {
    return Response.json(
      {
        ok: false,
        error: "insufficient_coins",
        coins: outcome.coins,
        progression: outcome.progression,
      },
      { status: 402 },
    );
  }
  return Response.json({
    ok: true,
    gearKind,
    gearId,
    coins: outcome.coins,
    progression: outcome.progression,
  });
}

// 소비템 구매 — 현재는 스태미나 회복약(stamina-potions.v1 +1). 보관형 소비템이라 반복 구매.
//   락 순서: fishing-wallet.v1 → stamina-potions.v1 (지갑 먼저 — 칭호 흐름과 동일 시작).
//   두 키를 함께 잡는 다른 라우트가 없어 교차 데드락 없음.
async function buyConsumable(userId: string, itemId: string): Promise<Response> {
  const price = fishingShopConsumablePriceFor(itemId);
  if (price === undefined) {
    return Response.json({ ok: false, error: "unknown_item" }, { status: 400 });
  }

  const outcome = await db.transaction(async (tx) => {
    const wallet = await lockSaveForUpdate<FishingWallet>(
      tx,
      userId,
      FISHING_WALLET_KEY,
      { coins: 0 },
    );
    const coins = walletCoins(wallet);
    if (coins < price) return { kind: "insufficient" as const, coins };
    const potSave = await lockSaveForUpdate<{ count: number }>(
      tx,
      userId,
      STAMINA_POTIONS_KEY,
      { count: 0 },
    );
    const nextCount = staminaPotionCount(potSave) + 1;
    await upsertSave(tx, userId, STAMINA_POTIONS_KEY, { count: nextCount });
    const coinBalance = coins - price;
    await upsertSave(tx, userId, FISHING_WALLET_KEY, { coins: coinBalance });
    return { kind: "ok" as const, coinBalance, staminaPotions: nextCount };
  });

  if (outcome.kind === "insufficient") {
    return Response.json(
      { ok: false, error: "insufficient_coins", coins: outcome.coins },
      { status: 402 },
    );
  }
  return Response.json({
    ok: true,
    itemId,
    coins: outcome.coinBalance,
    staminaPotions: outcome.staminaPotions,
  });
}
