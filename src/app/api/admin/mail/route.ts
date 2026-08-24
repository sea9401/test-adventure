import { eq } from "drizzle-orm";
import { db } from "@/db";
import { marketplaceInbox, users } from "@/db/schema";
import { requireAdmin, currentAdminEmail } from "@/lib/server/isAdmin";
import { logAdminAction } from "@/lib/server/adminAudit";
import {
  inboxValues,
  type AdminGiftCashItem,
  type AdminGiftCookingIngredient,
  type GuildQuestRewardItem,
  type GuildQuestRewardMaterial,
} from "@/lib/server/inboxPayload";
import { V2_MATERIALS } from "@/adventure/data/v2/dungeonDrops";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";
import { normalizeAdventureSupportGrantDays } from "@/adventure/data/v2/adventureSupport";
import { isMuseunAdminGiftItemId } from "@/adventure/data/v2/museunCashItems";
import { isCookingKitchenItemId } from "@/adventure/v2/cooking/kitchen";

// POST /api/admin/mail — 운영자 대량 우편(골드/재료/요리 재료/장비/소비템/무슨 코인 + 메시지)을
// 한 유저 또는 전체 유저에게 발송.
//   body: { target: "user" | "all", userId?, gold,
//           materials?: { materialId, count }[],
//           cookingIngredients?: { ingredientId, count }[],
//           items?: { itemId, count }[], staminaPotions?,
//           museunCoins?, cashItems?: { itemId, count }[], message? }
// 우편함(marketplace_inbox)에 kind='admin_gift' 행으로 적재 → 수신자가 우편함에서 수령(claim)
// 시 각 전용 세이브에 지급(장비는 base 등급). fromName="운영자". 모든 발송은 감사 로그에 기록.
//
// ⚠️ target="all" 은 전체 유저에게 자원을 지급하는 강력한 작업 — 관리자 UI 에서 2단계 확인.
const MESSAGE_MAX = 300;
// 우편 1건당 각 첨부 목록의 항목 수 상한 — payload 비대·오발송 방어.
const MAX_ATTACHMENT_ENTRIES = 30;
const MAX_COUNT = 1_000_000;

// 첨부 파싱 — 유효 카탈로그 id + 양의 정수 count 만 통과. 항목 수 상한 적용.
function parseAttachMaterials(v: unknown): GuildQuestRewardMaterial[] {
  if (!Array.isArray(v)) return [];
  const out: GuildQuestRewardMaterial[] = [];
  for (const e of v) {
    if (out.length >= MAX_ATTACHMENT_ENTRIES) break;
    if (typeof e !== "object" || e === null) continue;
    const r = e as Record<string, unknown>;
    const materialId = typeof r.materialId === "string" ? r.materialId : "";
    const count =
      typeof r.count === "number" && Number.isFinite(r.count)
        ? Math.trunc(r.count)
        : 0;
    if (materialId in V2_MATERIALS && count > 0) {
      out.push({ materialId, count: Math.min(count, MAX_COUNT) });
    }
  }
  return out;
}

function parseAttachItems(v: unknown): GuildQuestRewardItem[] {
  if (!Array.isArray(v)) return [];
  const out: GuildQuestRewardItem[] = [];
  for (const e of v) {
    if (out.length >= MAX_ATTACHMENT_ENTRIES) break;
    if (typeof e !== "object" || e === null) continue;
    const r = e as Record<string, unknown>;
    const itemId = typeof r.itemId === "string" ? r.itemId : "";
    const count =
      typeof r.count === "number" && Number.isFinite(r.count)
        ? Math.trunc(r.count)
        : 0;
    if (itemId in V2_EQUIPMENT && count > 0) {
      out.push({ itemId, count: Math.min(count, MAX_COUNT) });
    }
  }
  return out;
}

function parseAttachCookingIngredients(
  v: unknown,
): AdminGiftCookingIngredient[] {
  if (!Array.isArray(v)) return [];
  const out: AdminGiftCookingIngredient[] = [];
  for (const entry of v) {
    if (out.length >= MAX_ATTACHMENT_ENTRIES) break;
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const ingredientId =
      typeof row.ingredientId === "string" ? row.ingredientId : "";
    const count =
      typeof row.count === "number" && Number.isFinite(row.count)
        ? Math.trunc(row.count)
        : 0;
    if (isCookingKitchenItemId(ingredientId) && count > 0) {
      out.push({ ingredientId, count: Math.min(count, MAX_COUNT) });
    }
  }
  return out;
}

function parseAttachCashItems(v: unknown): AdminGiftCashItem[] {
  if (!Array.isArray(v)) return [];
  const out: AdminGiftCashItem[] = [];
  for (const entry of v) {
    if (out.length >= MAX_ATTACHMENT_ENTRIES) break;
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const itemId = typeof row.itemId === "string" ? row.itemId : "";
    const count =
      typeof row.count === "number" && Number.isFinite(row.count)
        ? Math.trunc(row.count)
        : 0;
    if (isMuseunAdminGiftItemId(itemId) && count > 0) {
      out.push({ itemId, count: Math.min(count, MAX_COUNT) });
    }
  }
  return out;
}

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (gate) return gate;
  const adminEmail = await currentAdminEmail();

  let body: {
    target?: unknown;
    userId?: unknown;
    gold?: unknown;
    materials?: unknown;
    cookingIngredients?: unknown;
    items?: unknown;
    staminaPotions?: unknown;
    museunCoins?: unknown;
    cashItems?: unknown;
    adventureSupportDays?: unknown;
    message?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const target = body.target === "all" ? "all" : "user";
  const gold =
    typeof body.gold === "number" && Number.isFinite(body.gold)
      ? Math.max(0, Math.trunc(body.gold))
      : 0;
  const materials = parseAttachMaterials(body.materials);
  const cookingIngredients = parseAttachCookingIngredients(
    body.cookingIngredients,
  );
  const items = parseAttachItems(body.items);
  const staminaPotions =
    typeof body.staminaPotions === "number" && Number.isFinite(body.staminaPotions)
      ? Math.max(0, Math.min(MAX_COUNT, Math.trunc(body.staminaPotions)))
      : 0;
  const museunCoins =
    typeof body.museunCoins === "number" && Number.isFinite(body.museunCoins)
      ? Math.max(0, Math.min(MAX_COUNT, Math.trunc(body.museunCoins)))
      : 0;
  const cashItems = parseAttachCashItems(body.cashItems);
  const adventureSupportDays = normalizeAdventureSupportGrantDays(
    body.adventureSupportDays,
  );
  const message =
    typeof body.message === "string" ? body.message.trim().slice(0, MESSAGE_MAX) : "";

  // 첨부 보상 중 하나는 있어야 발송(빈 우편 차단).
  if (
    gold <= 0 &&
    materials.length === 0 &&
    cookingIngredients.length === 0 &&
    items.length === 0 &&
    staminaPotions <= 0 &&
    museunCoins <= 0 &&
    cashItems.length === 0 &&
    adventureSupportDays <= 0
  ) {
    return Response.json(
      {
        ok: false,
        error:
          "nothing to send (gold/materials/cookingIngredients/items/staminaPotions/museunCoins/cashItems/adventureSupportDays all empty)",
      },
      { status: 400 },
    );
  }

  const payload = {
    kind: "admin_gift" as const,
    gold,
    materials,
    cookingIngredients,
    items,
    staminaPotions,
    staminaPotionsBound: true,
    museunCoins,
    cashItems,
    adventureSupportDays,
  };
  const mkRow = (userId: string) =>
    inboxValues({
      userId,
      payload,
      message: message || null,
      fromName: "운영자",
    });

  let recipients = 0;

  if (target === "user") {
    const userId = typeof body.userId === "string" ? body.userId : "";
    if (!userId) {
      return Response.json(
        { ok: false, error: "userId required for target=user" },
        { status: 400 },
      );
    }
    const [u] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!u) {
      return Response.json({ ok: false, error: "user not found" }, { status: 404 });
    }
    await db.insert(marketplaceInbox).values(mkRow(userId));
    recipients = 1;
  } else {
    // 전체 유저 — id 만 뽑아 일괄 insert.
    const all = await db.select({ id: users.id }).from(users);
    if (all.length === 0) {
      return Response.json({
        ok: true,
        target,
        recipients: 0,
        gold,
        materials,
        cookingIngredients,
        items,
        staminaPotions,
        museunCoins,
        cashItems,
        adventureSupportDays,
      });
    }
    await db.insert(marketplaceInbox).values(all.map((u) => mkRow(u.id)));
    recipients = all.length;
  }

  await logAdminAction({
    adminEmail,
    action: target === "all" ? "mail.broadcast" : "mail.user",
    targetUserId: target === "user" ? (body.userId as string) : null,
    detail: {
      gold,
      recipients,
      message: message || undefined,
      materials: materials.length > 0 ? materials : undefined,
      cookingIngredients:
        cookingIngredients.length > 0 ? cookingIngredients : undefined,
      items: items.length > 0 ? items : undefined,
      staminaPotions: staminaPotions > 0 ? staminaPotions : undefined,
      museunCoins: museunCoins > 0 ? museunCoins : undefined,
      cashItems: cashItems.length > 0 ? cashItems : undefined,
      adventureSupportDays:
        adventureSupportDays > 0 ? adventureSupportDays : undefined,
    },
  });

  return Response.json({
    ok: true,
    target,
    recipients,
    gold,
    materials,
    cookingIngredients,
    items,
    staminaPotions,
    museunCoins,
    cashItems,
    adventureSupportDays,
  });
}
