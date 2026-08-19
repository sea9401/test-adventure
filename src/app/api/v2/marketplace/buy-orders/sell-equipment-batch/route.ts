import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import { parseEquipmentSave } from "@/adventure/data/v2/v2Equipment";
import {
  marketplaceEquipListError,
  marketplaceTaxRateForAdventureSupport,
} from "@/lib/server/marketplaceV2";
import { adventureSupportActive } from "@/adventure/data/v2/adventureSupport";
import { clientIpFromRequest } from "@/lib/server/abuseLog";
import {
  fillBestEquipmentBuyOrder,
  prepareEquipmentBuyOrderSaleScope,
  recordEquipmentBuyOrderSale,
  requireEquipmentBuyOrderSaleParticipants,
} from "@/lib/server/equipmentBuyOrderSale";
import {
  TradeSuspendedError,
  tradeSuspendedResponse,
} from "@/lib/server/tradeSuspension";

const BATCH_MAX = 10;
type CharSave = { adventureSupport?: unknown; [key: string]: unknown };

function bad(error: string, status = 400) {
  return Response.json({ ok: false, error }, { status });
}

/** 최대 10개를 한 번에 요청하되 각 장비의 상대 주문은 서버가 독립적으로 최고가→시간 우선 선택한다. */
export async function POST(req: Request) {
  const sellerId = await ensureUser();
  if (!sellerId) return bad("unauthorized", 401);
  const limited = enforceUserAndIpRateLimit(req, {
    userId: sellerId,
    action: "v2:marketplace:buy-orders:sell-equipment-batch",
    userLimit: 10,
    ipLimit: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: { iids?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return bad("invalid_json");
  }
  if (
    !Array.isArray(body.iids) ||
    body.iids.length < 1 ||
    body.iids.length > BATCH_MAX ||
    body.iids.some((iid) => typeof iid !== "string" || iid.length === 0)
  ) {
    return bad("bad_iids");
  }
  const iids = [...new Set(body.iids as string[])];
  const batchId = randomUUID();
  const now = new Date();

  const result = await db.transaction(async (tx) => {
    const probeEquipment = parseEquipmentSave(
      await readSave<Record<string, unknown>>(tx, sellerId, "equipment.v2", {}),
    );
    const probeOwnedByIid = new Map(
      probeEquipment.owned.map((instance) => [instance.iid, instance]),
    );
    const probeEquippedIids = new Set(Object.values(probeEquipment.equipped));
    const probedInstances = iids
      .slice()
      .sort()
      .flatMap((iid) => {
        const instance = probeOwnedByIid.get(iid);
        return instance &&
          !marketplaceEquipListError(instance, probeEquippedIids.has(iid))
          ? [instance]
          : [];
      });
    const probedIids = new Set(probedInstances.map((instance) => instance.iid));
    const saleScope = await prepareEquipmentBuyOrderSaleScope(tx, {
      sellerId,
      instances: probedInstances,
      now,
    });
    requireEquipmentBuyOrderSaleParticipants(saleScope, [sellerId]);

    const sellerCharacter = await lockSaveForUpdate<CharSave>(
      tx,
      sellerId,
      "character.v2",
      {},
    );
    const equipmentSave = await lockSaveForUpdate<Record<string, unknown>>(
      tx,
      sellerId,
      "equipment.v2",
      {},
    );
    const { owned, equipped } = parseEquipmentSave(equipmentSave);
    const ownedByIid = new Map(owned.map((instance) => [instance.iid, instance]));
    const equippedIids = new Set(Object.values(equipped));
    const taxRate = marketplaceTaxRateForAdventureSupport(
      adventureSupportActive(sellerCharacter.adventureSupport),
    );
    const audits = [];
    const skipped: Array<{ iid: string; error: string }> = [];

    // 요청 배열 순서에 기대지 않도록 서버에서 고정 정렬한다.
    for (const iid of iids.slice().sort()) {
      const instance = ownedByIid.get(iid);
      if (!instance || !probedIids.has(iid)) {
        skipped.push({ iid, error: "not_owned" });
        continue;
      }
      const listError = marketplaceEquipListError(
        instance,
        equippedIids.has(iid),
      );
      if (listError) {
        skipped.push({ iid, error: listError });
        continue;
      }
      const audit = await fillBestEquipmentBuyOrder(tx, {
        sellerId,
        instance,
        taxRate,
        now,
        preparedScope: saleScope,
      });
      if (!audit) {
        skipped.push({ iid, error: "no_matching_order" });
        continue;
      }
      audits.push(audit);
    }
    if (audits.length === 0) {
      return {
        status: 409,
        body: { ok: false as const, error: "no_matching_order" },
      };
    }
    const soldIids = new Set(audits.map((audit) => audit.iid));
    const nextOwned = owned.filter((instance) => !soldIids.has(instance.iid));
    await upsertSave(tx, sellerId, "equipment.v2", {
      owned: nextOwned,
      equipped,
    });
    return {
      status: 200,
      audits,
      body: {
        ok: true as const,
        batchId,
        sold: audits.length,
        skipped: skipped.length,
        grossGold: audits.reduce((sum, audit) => sum + audit.price, 0),
        proceedsGold: audits.reduce((sum, audit) => sum + audit.proceeds, 0),
      },
    };
  }).catch((error) => {
    if (error instanceof TradeSuspendedError) return tradeSuspendedResponse(error);
    throw error;
  });
  if (result instanceof Response) return result;

  const audits =
    "audits" in result && Array.isArray(result.audits) ? result.audits : [];
  const ip = clientIpFromRequest(req);
  for (const audit of audits) {
    recordEquipmentBuyOrderSale(audit, { sellerId, ip, batchId });
  }
  return Response.json(result.body, { status: result.status });
}
