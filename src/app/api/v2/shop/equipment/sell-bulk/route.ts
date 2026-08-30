import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { recordEconomyEventSoon } from "@/lib/server/economyLog";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { parseEquipmentSave } from "@/adventure/data/v2/v2Equipment";
import {
  MAX_EXPLICIT_SELL_COUNT,
  selectBulkSell,
  selectExplicitSell,
} from "@/adventure/data/v2/v2EquipVariance";
import type { V2EquipSlot } from "@/adventure/data/v2/v2Equipment";
import { boundEquipmentDisposalView } from "@/lib/server/boundEquipmentDisposal";

// POST /api/v2/shop/equipment/sell-bulk — 보유 장비 일괄 판매 (개체 모델).
//
// body: { slot?: 6슬롯 중 하나, belowPct?: number } 또는 { iids: string[] }
// 미장착 + 미잠금 개체를 일괄 판매(전 장비 판매 가능 — 유니크·수련용·제작도 포함, 2026-06-07).
//   slot 주면 그 슬롯만,
// belowPct 주면 품질% ≤ belowPct 만(굴림 없는 상점템은 belowPct 모드서 제외).
// 선택 로직은 selectBulkSell(클라 미리보기와 공용) — 서버가 권위.

const VALID_SLOTS = new Set<V2EquipSlot>([
  "weapon",
  "armor",
  "gloves",
  "boots",
  "ring",
  "necklace",
]);

type CharSave = { gold?: number; bankedGold?: number; [k: string]: unknown };

function safeGold(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:shop:equipment:sell-bulk",
    userLimit: 30,
    ipLimit: 180,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let parsedBody: unknown;
  try {
    parsedBody = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (
    parsedBody == null ||
    typeof parsedBody !== "object" ||
    Array.isArray(parsedBody)
  ) {
    return Response.json({ ok: false, error: "bad_body" }, { status: 400 });
  }
  const body = parsedBody as {
    slot?: unknown;
    belowPct?: unknown;
    iids?: unknown;
    confirmBound?: unknown;
  };
  const hasExplicitSelection = Object.hasOwn(body, "iids");
  let selectedIids: string[] | undefined;
  if (hasExplicitSelection) {
    if (body.slot != null || body.belowPct != null) {
      return Response.json(
        { ok: false, error: "mixed_sell_mode" },
        { status: 400 },
      );
    }
    if (
      !Array.isArray(body.iids) ||
      body.iids.length === 0 ||
      body.iids.length > MAX_EXPLICIT_SELL_COUNT ||
      body.iids.some(
        (iid) => typeof iid !== "string" || iid.length === 0 || iid.length > 200,
      ) ||
      new Set(body.iids).size !== body.iids.length
    ) {
      return Response.json({ ok: false, error: "bad_iids" }, { status: 400 });
    }
    selectedIids = body.iids as string[];
  }
  let slot: V2EquipSlot | undefined;
  if (body.slot != null) {
    if (
      typeof body.slot !== "string" ||
      !VALID_SLOTS.has(body.slot as V2EquipSlot)
    ) {
      return Response.json({ ok: false, error: "bad_slot" }, { status: 400 });
    }
    slot = body.slot as V2EquipSlot;
  }
  let belowPct: number | undefined;
  if (body.belowPct != null) {
    if (typeof body.belowPct !== "number" || !Number.isFinite(body.belowPct)) {
      return Response.json(
        { ok: false, error: "bad_belowPct" },
        { status: 400 },
      );
    }
    belowPct = Math.max(0, Math.min(100, body.belowPct));
  }

  const result = await db.transaction(async (tx) => {
    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const equipSave = await lockSaveForUpdate<Record<string, unknown>>(
      tx,
      userId,
      "equipment.v2",
      {},
    );
    const { owned, equipped } = parseEquipmentSave(equipSave);
    const explicitResult = selectedIids
      ? selectExplicitSell(owned, equipped, selectedIids)
      : null;
    if (explicitResult && !explicitResult.ok) {
      return {
        status: 409,
        body: {
          ok: false as const,
          error: explicitResult.reason,
          gold: safeGold(charSave.gold),
          bankedGold: safeGold(charSave.bankedGold),
          owned,
          equipped,
        },
      };
    }
    const boundItems = selectedIids
      ? owned.filter(
          (instance) =>
            selectedIids.includes(instance.iid) && instance.bound === true,
        )
      : [];
    if (
      explicitResult?.ok &&
      boundItems.length > 0 &&
      body.confirmBound !== true
    ) {
      return {
        status: 409,
        body: {
          ok: false as const,
          error: "bound_confirmation_required" as const,
          items: boundItems.map(boundEquipmentDisposalView),
          gold: safeGold(charSave.gold),
          bankedGold: safeGold(charSave.bankedGold),
          owned,
          equipped,
        },
      };
    }
    const plan = explicitResult?.plan ??
      selectBulkSell(owned, equipped, { slot, belowPct });
    if (plan.count === 0) {
      return {
        status: 200,
        body: {
          ok: true as const,
          soldCount: 0,
          soldGold: 0,
          skippedBoundCount: plan.skippedBoundCount,
          gold: safeGold(charSave.gold),
          bankedGold: safeGold(charSave.bankedGold),
          owned,
          equipped,
        },
      };
    }
    const sellSet = new Set(plan.iids);
    const nextOwned = owned.filter((i) => !sellSet.has(i.iid));
    const gold = safeGold(charSave.gold);
    const newBankedGold = safeGold(charSave.bankedGold) + plan.gold;
    await upsertSave(tx, userId, "equipment.v2", {
      owned: nextOwned,
      equipped,
    });
    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      gold,
      bankedGold: newBankedGold,
    });
    return {
      status: 200,
      log: {
        soldCount: plan.count,
        soldGold: plan.gold,
        skippedBoundCount: plan.skippedBoundCount,
        slot,
        belowPct,
        selectionMode: selectedIids != null,
      },
      body: {
        ok: true as const,
        soldCount: plan.count,
        soldGold: plan.gold,
        skippedBoundCount: plan.skippedBoundCount,
        gold,
        bankedGold: newBankedGold,
        owned: nextOwned,
        equipped,
      },
    };
  });

  const economyLog = result.status === 200 && "log" in result ? result.log : null;
  if (economyLog && economyLog.soldCount > 0) {
    recordEconomyEventSoon({
      userId,
      eventType: "shop.equipment.sell_bulk",
      goldDelta: economyLog.soldGold,
      itemKind: "equip",
      quantity: economyLog.soldCount,
      detail: {
        soldGold: economyLog.soldGold,
        slot: economyLog.slot ?? null,
        belowPct: economyLog.belowPct ?? null,
        selectionMode: economyLog.selectionMode,
      },
    });
  }

  return Response.json(result.body, { status: result.status });
}
