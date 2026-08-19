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
  requireTradeParticipants,
  tradeSuspendedResponse,
} from "@/lib/server/tradeSuspension";

type CharSave = { adventureSupport?: unknown; [key: string]: unknown };

function bad(error: string, status = 400) {
  return Response.json({ ok: false, error }, { status });
}

// 판매자는 주문 ID나 구매자를 지정하지 않는다. 서버가 조건을 만족하는 최고가→시간 우선 주문을 선택한다.
export async function POST(req: Request) {
  const sellerId = await ensureUser();
  if (!sellerId) return bad("unauthorized", 401);
  const limited = enforceUserAndIpRateLimit(req, {
    userId: sellerId,
    action: "v2:marketplace:buy-orders:sell-equipment",
    userLimit: 30,
    ipLimit: 180,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: { iid?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return bad("invalid_json");
  }
  if (typeof body.iid !== "string" || body.iid.length === 0) {
    return bad("bad_iid");
  }
  const iid = body.iid;
  const now = new Date();

  const result = await db.transaction(async (tx) => {
    const probeEquipment = parseEquipmentSave(
      await readSave<Record<string, unknown>>(tx, sellerId, "equipment.v2", {}),
    );
    const probeInstance = probeEquipment.owned.find((item) => item.iid === iid);
    if (!probeInstance) {
      await requireTradeParticipants(tx, [sellerId], now);
      return { status: 400, body: { ok: false as const, error: "not_owned" } };
    }
    const probeListError = marketplaceEquipListError(
      probeInstance,
      Object.values(probeEquipment.equipped).includes(iid),
    );
    if (probeListError) {
      await requireTradeParticipants(tx, [sellerId], now);
      return { status: 400, body: { ok: false as const, error: probeListError } };
    }
    const saleScope = await prepareEquipmentBuyOrderSaleScope(tx, {
      sellerId,
      instances: [probeInstance],
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
    const instance = owned.find((item) => item.iid === iid);
    if (!instance) {
      return { status: 400, body: { ok: false as const, error: "not_owned" } };
    }
    const listError = marketplaceEquipListError(
      instance,
      Object.values(equipped).includes(iid),
    );
    if (listError) {
      return { status: 400, body: { ok: false as const, error: listError } };
    }
    const audit = await fillBestEquipmentBuyOrder(tx, {
      sellerId,
      instance,
      taxRate: marketplaceTaxRateForAdventureSupport(
        adventureSupportActive(sellerCharacter.adventureSupport),
      ),
      now,
      preparedScope: saleScope,
    });
    if (!audit) {
      return {
        status: 409,
        body: { ok: false as const, error: "no_matching_order" },
      };
    }
    await upsertSave(tx, sellerId, "equipment.v2", {
      owned: owned.filter((item) => item.iid !== iid),
      equipped,
    });
    return {
      status: 200,
      audit,
      body: {
        ok: true as const,
        itemName: audit.itemName,
        paid: audit.price,
        proceeds: audit.proceeds,
      },
    };
  }).catch((error) => {
    if (error instanceof TradeSuspendedError) return tradeSuspendedResponse(error);
    throw error;
  });
  if (result instanceof Response) return result;

  const audit = "audit" in result ? result.audit : undefined;
  if (result.status === 200 && audit) {
    recordEquipmentBuyOrderSale(audit, {
      sellerId,
      ip: clientIpFromRequest(req),
    });
  }
  return Response.json(result.body, { status: result.status });
}
