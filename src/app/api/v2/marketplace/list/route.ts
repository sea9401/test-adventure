import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { marketplaceListingsV2 } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { parseEquipmentSave } from "@/adventure/data/v2/v2Equipment";
import {
  MARKETPLACE_V2_SLOT_LIMIT,
  isMarketKind,
  isTradableEquip,
  isTradableMaterial,
  isValidMaterialQty,
  isValidPrice,
  itemDisplayName,
  resolvePlayerName,
  type MarketKind,
} from "@/lib/server/marketplaceV2";

// POST /api/v2/marketplace/list — 매물 등록(에스크로: 내 save 에서 빼서 listing 으로 묶음).
//   body(장비):  { kind:"equip", iid:string, price:int }
//   body(재료):  { kind:"material", itemId:string, quantity:int, price:int }
// 활성 매물 슬롯 상한 체크. 장비=미장착·미잠금 개체만. 가격은 정수 [1, 999,999,999].

type CharSave = {
  gold?: number;
  materials?: Record<string, number>;
  [k: string]: unknown;
};

function bad(error: string, status = 400) {
  return Response.json({ ok: false, error }, { status });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return bad("unauthorized", 401);

  let body: {
    kind?: unknown;
    iid?: unknown;
    itemId?: unknown;
    quantity?: unknown;
    price?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return bad("invalid_json");
  }

  if (!isMarketKind(body.kind)) return bad("bad_kind");
  const kind: MarketKind = body.kind;
  if (!isValidPrice(body.price)) return bad("bad_price");
  const price = body.price;

  const result = await db.transaction(async (tx) => {
    // 판매자 직렬화 — character.v2 를 먼저 잠가 동시 list 요청이 슬롯 상한을 우회하지 못하게 한다
    //   (같은 seller 의 모든 list 가 이 단일 행으로 순서화). 잠금 순서 character.v2 → equipment.v2
    //   는 buy·sell-bulk 와 일관(데드락 회피). material 경로는 이 charSave 를 그대로 씀.
    const charSave = await lockSaveForUpdate<CharSave>(tx, userId, "character.v2", {});

    // 슬롯 상한 — 활성 매물 수(seller 락 이후라 동시 요청 직렬화됨 = 엄격).
    const [{ c: activeCount }] = await tx
      .select({ c: count() })
      .from(marketplaceListingsV2)
      .where(
        and(
          eq(marketplaceListingsV2.sellerId, userId),
          eq(marketplaceListingsV2.status, "active"),
        ),
      );
    if (activeCount >= MARKETPLACE_V2_SLOT_LIMIT) {
      return { status: 400, body: { ok: false as const, error: "slot_full" } };
    }

    const sellerName = (await resolvePlayerName(tx, userId)) ?? "이름없음";

    if (kind === "equip") {
      if (typeof body.iid !== "string") return { status: 400, body: { ok: false as const, error: "bad_iid" } };
      const iid = body.iid;
      const equipSave = await lockSaveForUpdate<Record<string, unknown>>(
        tx,
        userId,
        "equipment.v2",
        {},
      );
      const { owned, equipped } = parseEquipmentSave(equipSave);
      const inst = owned.find((i) => i.iid === iid);
      if (!inst) return { status: 400, body: { ok: false as const, error: "not_owned" } };
      if (!isTradableEquip(inst.id)) return { status: 400, body: { ok: false as const, error: "not_tradable" } };
      if (inst.locked) return { status: 400, body: { ok: false as const, error: "locked" } };
      const isEquipped = Object.values(equipped).includes(iid);
      if (isEquipped) return { status: 400, body: { ok: false as const, error: "equipped" } };

      // 에스크로 — owned 에서 제거.
      const nextOwned = owned.filter((i) => i.iid !== iid);
      await upsertSave(tx, userId, "equipment.v2", { owned: nextOwned, equipped });

      const [row] = await tx
        .insert(marketplaceListingsV2)
        .values({
          sellerId: userId,
          sellerName,
          kind: "equip",
          itemId: inst.id,
          itemName: itemDisplayName("equip", inst.id) ?? inst.id,
          quantity: 1,
          price,
          // roll 스냅샷(iid 제외) — 구매 시 새 개체로 복원. roll 없으면 null.
          // 굴림 + 강화를 한 payload 에 — 옛 행은 raw roll 객체(권위 파스가 양형 흡수).
          instancePayload:
            inst.roll || inst.enhance
              ? {
                  ...(inst.roll ?? {}),
                  ...(inst.enhance ? { enhance: inst.enhance } : {}),
                }
              : null,
        })
        .returning({ id: marketplaceListingsV2.id });
      return { status: 200, body: { ok: true as const, listingId: row.id } };
    }

    // material
    if (typeof body.itemId !== "string" || !isTradableMaterial(body.itemId)) {
      return { status: 400, body: { ok: false as const, error: "not_tradable" } };
    }
    if (!isValidMaterialQty(body.quantity)) {
      return { status: 400, body: { ok: false as const, error: "bad_quantity" } };
    }
    const itemId = body.itemId;
    const quantity = body.quantity;
    // charSave 는 tx 시작 시 이미 잠금·읽음(seller 직렬화 겸용) — 재read 불필요.
    const mats = { ...(charSave.materials ?? {}) };
    const have = Math.max(0, Math.floor(mats[itemId] ?? 0));
    if (have < quantity) {
      return { status: 400, body: { ok: false as const, error: "insufficient_material" } };
    }
    const left = have - quantity;
    if (left > 0) mats[itemId] = left;
    else delete mats[itemId];
    await upsertSave(tx, userId, "character.v2", { ...charSave, materials: mats });

    const [row] = await tx
      .insert(marketplaceListingsV2)
      .values({
        sellerId: userId,
        sellerName,
        kind: "material",
        itemId,
        itemName: itemDisplayName("material", itemId) ?? itemId,
        quantity,
        price,
        instancePayload: null,
      })
      .returning({ id: marketplaceListingsV2.id });
    return { status: 200, body: { ok: true as const, listingId: row.id } };
  });

  return Response.json(result.body, { status: result.status });
}
