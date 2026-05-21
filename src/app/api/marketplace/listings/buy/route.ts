import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  marketplaceInbox,
  marketplaceListings,
  savesKv,
} from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { checkSession } from "@/lib/server/checkSession";
import { isItemKind, MARKETPLACE_FEE_RATE } from "@/lib/server/marketplace";
import { inboxValues } from "@/lib/server/inboxPayload";
import type { EquipmentInstance } from "@/adventure/inventory/equipmentInstances";
import { upsertSave } from "@/lib/server/savesKv";

const SAVES_CHARACTER = "character.v2";
const SAVES_CRAFTING = "crafting.v2";

// POST /api/marketplace/listings/buy
//   body: { id: number }
// 트랜잭션 단위 처리:
//   1) listing 잠금·active 확인·자기거래 차단
//   2) buyer character.v2 잠금·골드 충분 확인
//   3) 골드 차감 + listing.sold 마킹 (조건부 UPDATE 로 race 보호)
//   4) seller 우편함(sale_proceeds), buyer 우편함(purchase_item) 적재
export async function POST(req: Request) {
  const buyerId = await ensureUser();
  if (!buyerId) return new Response("unauthorized", { status: 401 });
  const sessionFail = await checkSession(buyerId, req);
  if (sessionFail) return sessionFail;

  let body: { id?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  const listingId = Number(body.id);
  if (!Number.isInteger(listingId) || listingId <= 0) {
    return new Response("invalid id", { status: 400 });
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [listing] = await tx
        .select()
        .from(marketplaceListings)
        .where(eq(marketplaceListings.id, listingId))
        .for("update");

      if (!listing) return { error: "not_found", status: 404 as const };
      if (listing.status !== "active") {
        return { error: "not_active", status: 409 as const };
      }
      if (listing.sellerId === buyerId) {
        return { error: "self_buy", status: 400 as const };
      }

      // recipe 사전 차단 — 이미 알고 있으면 골드 차감 / listing 마킹 없이 종료.
      if (listing.itemKind === "recipe") {
        const craftRows = await tx
          .select()
          .from(savesKv)
          .where(
            and(eq(savesKv.userId, buyerId), eq(savesKv.key, SAVES_CRAFTING)),
          );
        const known = (craftRows[0]?.value as { known?: unknown } | undefined)
          ?.known;
        const knownArr = Array.isArray(known) ? (known as string[]) : [];
        if (knownArr.includes(listing.itemId)) {
          return { error: "already_known", status: 400 as const };
        }
      }

      // 캐릭터 행 잠금 + gold 확인.
      const charRows = await tx
        .select()
        .from(savesKv)
        .where(
          and(eq(savesKv.userId, buyerId), eq(savesKv.key, SAVES_CHARACTER)),
        )
        .for("update");
      if (charRows.length === 0) {
        return { error: "no_character", status: 400 as const };
      }
      const character = charRows[0].value as Record<string, unknown>;
      const gold = Number((character as { gold?: unknown }).gold ?? 0);
      if (!Number.isFinite(gold) || gold < listing.price) {
        return { error: "insufficient_gold", status: 400 as const };
      }
      const newGold = gold - listing.price;
      const nextCharacter = { ...character, gold: newGold };

      // listing 마킹 — status='active' 조건부로 race 한 번 더 닫음.
      const updated = await tx
        .update(marketplaceListings)
        .set({
          status: "sold",
          closedAt: new Date(),
          buyerId,
        })
        .where(
          and(
            eq(marketplaceListings.id, listingId),
            eq(marketplaceListings.status, "active"),
          ),
        )
        .returning({ id: marketplaceListings.id });
      if (updated.length === 0) {
        return { error: "race", status: 409 as const };
      }

      // 캐릭터 골드 차감 저장.
      await upsertSave(tx, buyerId, SAVES_CHARACTER, nextCharacter);

      // 수수료 계산 (정수 floor) + 우편함 적재.
      const fee = Math.floor(listing.price * MARKETPLACE_FEE_RATE);
      const sellerGets = listing.price - fee;

      const feeNote = fee > 0 ? ` (수수료 ${fee.toLocaleString()} G)` : "";
      await tx.insert(marketplaceInbox).values(
        inboxValues({
          userId: listing.sellerId,
          payload: { kind: "sale_proceeds", gold: sellerGets },
          message: `${listing.itemName} 판매 — ${sellerGets.toLocaleString()} G 수령${feeNote}`,
          listingId: listing.id,
        }),
      );

      // listing.itemKind 는 DB 에 적힌 string — 안전한 union 으로 좁힘.
      if (!isItemKind(listing.itemKind)) {
        throw new Error(`invalid item_kind in listing: ${listing.itemKind}`);
      }
      const [buyerInbox] = await tx
        .insert(marketplaceInbox)
        .values(
          inboxValues({
            userId: buyerId,
            payload: {
              kind: "purchase_item",
              item_kind: listing.itemKind,
              item_id: listing.itemId,
              grade: listing.grade,
              quantity: listing.quantity,
              // 인스턴스 매물(강화/부여)이면 스냅샷 첨부 — claim 시 새 instanceId 로 push.
              ...(listing.instancePayload
                ? { instance: listing.instancePayload as EquipmentInstance }
                : {}),
            },
            message: `${listing.itemName}${
              listing.quantity > 1 ? ` ×${listing.quantity}` : ""
            } 구매 — 우편함에서 수령`,
            listingId: listing.id,
          }),
        )
        .returning({ id: marketplaceInbox.id });

      return {
        ok: true as const,
        newGold,
        fee,
        sellerName: listing.sellerName,
        itemName: listing.itemName,
        quantity: listing.quantity,
        inboxId: buyerInbox.id,
      };
    });

    if ("error" in result) {
      return new Response(result.error, { status: result.status });
    }
    return Response.json({
      ok: true,
      newGold: result.newGold,
      fee: result.fee,
      sellerName: result.sellerName,
      itemName: result.itemName,
      quantity: result.quantity,
      inboxId: result.inboxId,
    });
  } catch (e) {
    console.error("[marketplace.buy.POST] ", e);
    return new Response("internal error", { status: 500 });
  }
}
