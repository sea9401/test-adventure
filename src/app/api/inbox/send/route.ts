import { and, count, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { marketplaceInbox, savesKv, users } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { requireActiveDeviceSession } from "@/lib/server/checkSession";
import { inboxValues } from "@/lib/server/inboxPayload";
import { upsertSave } from "@/lib/server/savesKv";
import { PROFILE_STORAGE_KEY } from "@/lib/storage-keys";
import {
  USER_MESSAGE_DAILY_CAP,
  USER_MESSAGE_MAX_LENGTH,
  USER_MESSAGE_RATE_LIMIT_MS,
} from "@/lib/inbox-config";
import {
  getRecipeDef,
  getKnownArr,
  getShareableArr,
} from "@/lib/server/marketplace";
import {
  requireCurrentUgcConsent,
  usersCannotInteract,
} from "@/lib/server/ugcSafety";

const SAVES_CRAFTING = "crafting.v2";

type SenderProbe = {
  usersRowExists: boolean;
  usersNamePresent: boolean;
  profileRowExists: boolean;
  profileNamePresent: boolean;
  profileShape: string[] | null;
};

// 닉네임은 dual-source — `users.gameName` (신규 유저, authoritative) 와
// `savesKv[character-profile.v2].name` (레거시 유저). 한쪽이라도 있으면 사용.
async function resolveSenderName(
  userId: string,
): Promise<{ name: string | null; probe: SenderProbe }> {
  const [u] = await db
    .select({ name: users.gameName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const [profile] = await db
    .select({ value: savesKv.value })
    .from(savesKv)
    .where(
      and(eq(savesKv.userId, userId), eq(savesKv.key, PROFILE_STORAGE_KEY)),
    )
    .limit(1);
  const legacyName = (profile?.value as { name?: unknown } | undefined)?.name;

  const probe: SenderProbe = {
    usersRowExists: !!u,
    usersNamePresent: typeof u?.name === "string" && u.name.length > 0,
    profileRowExists: !!profile,
    profileNamePresent:
      typeof legacyName === "string" && legacyName.length > 0,
    profileShape: profile
      ? Object.keys((profile.value as Record<string, unknown>) ?? {})
      : null,
  };

  if (u?.name) return { name: u.name, probe };
  if (typeof legacyName === "string" && legacyName.length > 0) {
    return { name: legacyName, probe };
  }
  return { name: null, probe };
}

async function findRecipientByName(
  name: string,
): Promise<{ id: string; name: string } | null> {
  const [u] = await db
    .select({ id: users.id, name: users.gameName })
    .from(users)
    .where(sql`lower(${users.gameName}) = lower(${name})`)
    .limit(1);
  if (u?.name) return { id: u.id, name: u.name };
  const [legacy] = await db
    .select({ userId: savesKv.userId, value: savesKv.value })
    .from(savesKv)
    .where(
      sql`${savesKv.key} = ${PROFILE_STORAGE_KEY} and lower(${savesKv.value}->>'name') = lower(${name})`,
    )
    .limit(1);
  const legacyName = (legacy?.value as { name?: unknown } | undefined)?.name;
  if (legacy && typeof legacyName === "string" && legacyName.length > 0) {
    return { id: legacy.userId, name: legacyName };
  }
  return null;
}

// POST /api/inbox/send — 유저 간 쪽지 1통 발송.
//   body: { recipientName: string, text: string, attachedRecipeId?: string }
// 검증: 본인 차단, 길이, rate limit (마지막 발송 + 24h 누적), 수신자 존재.
// attachedRecipeId 가 있으면 inbox kind='recipe_gift' 로 적재 (text 는 message).
export async function POST(req: Request) {
  const senderId = await ensureUser({ skipDeviceCheck: true });
  if (!senderId) return new Response("unauthorized", { status: 401 });
  const sessionFail = await requireActiveDeviceSession(senderId, req);
  if (sessionFail) return sessionFail;

  let body: {
    recipientName?: unknown;
    text?: unknown;
    attachedRecipeId?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const recipientNameRaw =
    typeof body.recipientName === "string" ? body.recipientName.trim() : "";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const attachedRecipeId =
    typeof body.attachedRecipeId === "string" && body.attachedRecipeId.length > 0
      ? body.attachedRecipeId
      : null;

  if (!recipientNameRaw) return new Response("missing recipient", { status: 400 });
  // 첨부가 없을 때만 본문 필수. 첨부가 있으면 본문 비어도 됨.
  if (!attachedRecipeId && !text) return new Response("empty text", { status: 400 });
  if (text.length > USER_MESSAGE_MAX_LENGTH) {
    return new Response(`too long (max ${USER_MESSAGE_MAX_LENGTH})`, {
      status: 400,
    });
  }

  // 레시피 첨부: 정의·tradable 만 미리 검사. known/shareable 검증 + 토큰 소비는
  // 인박스 INSERT 와 같은 트랜잭션에서 처리해 race-free 하게.
  let recipeName: string | null = null;
  if (attachedRecipeId) {
    const recipe = getRecipeDef(attachedRecipeId);
    if (!recipe) return new Response("recipe_not_found", { status: 400 });
    if (recipe.tradable === false) {
      return new Response("recipe_not_tradable", { status: 400 });
    }
    recipeName = recipe.name;
  }

  const { name: senderName, probe } = await resolveSenderName(senderId);
  if (!senderName) {
    return Response.json(
      { error: "sender_no_name", probe },
      { status: 400 },
    );
  }

  const recipient = await findRecipientByName(recipientNameRaw);
  if (!recipient) {
    return new Response("recipient_not_found", { status: 404 });
  }
  if (recipient.id === senderId) {
    return new Response("self_send", { status: 400 });
  }
  if (await usersCannotInteract(senderId, recipient.id)) {
    return new Response("user_blocked", { status: 403 });
  }
  const consentFailure = await requireCurrentUgcConsent(senderId);
  if (consentFailure) return consentFailure;

  // rate limit — 마지막 발송 시각 + 24h 누적. recipe_gift 도 같은 한도에 포함.
  const since = new Date(Date.now() - USER_MESSAGE_RATE_LIMIT_MS);
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const senderKinds = ["user_message", "recipe_gift"];

  const [last] = await db
    .select({ createdAt: marketplaceInbox.createdAt })
    .from(marketplaceInbox)
    .where(
      and(
        eq(marketplaceInbox.fromUserId, senderId),
        inArray(marketplaceInbox.kind, senderKinds),
      ),
    )
    .orderBy(desc(marketplaceInbox.createdAt))
    .limit(1);
  if (last && last.createdAt > since) {
    return new Response("rate limited", { status: 429 });
  }

  const [{ value: dailyCount }] = await db
    .select({ value: count() })
    .from(marketplaceInbox)
    .where(
      and(
        eq(marketplaceInbox.fromUserId, senderId),
        inArray(marketplaceInbox.kind, senderKinds),
        gt(marketplaceInbox.createdAt, dayAgo),
      ),
    );
  if (dailyCount >= USER_MESSAGE_DAILY_CAP) {
    return new Response("daily_cap", { status: 429 });
  }

  if (attachedRecipeId && recipeName) {
    // recipe_gift — known/shareable 검증 + 토큰 소비 + 인박스 INSERT 를 한 트랜잭션.
    // 같은 토큰을 이중으로 못 쓰게 FOR UPDATE.
    try {
      const txResult = await db.transaction(async (tx) => {
        const craftRows = await tx
          .select()
          .from(savesKv)
          .where(
            and(eq(savesKv.userId, senderId), eq(savesKv.key, SAVES_CRAFTING)),
          )
          .for("update");
        const craft = (craftRows[0]?.value ?? {}) as Record<string, unknown>;
        const knownArr = getKnownArr(craft);
        if (!knownArr.includes(attachedRecipeId)) {
          return { error: "recipe_not_known", status: 400 as const };
        }
        const shareableArr = getShareableArr(craft);
        if (!shareableArr.includes(attachedRecipeId)) {
          return { error: "already_shared", status: 400 as const };
        }
        const nextShareable = shareableArr.filter((x) => x !== attachedRecipeId);
        const nextCraft = { ...craft, known: knownArr, shareable: nextShareable };
        await upsertSave(tx, senderId, SAVES_CRAFTING, nextCraft);
        await tx.insert(marketplaceInbox).values(
          inboxValues({
            userId: recipient.id,
            payload: {
              kind: "recipe_gift",
              recipe_id: attachedRecipeId,
              recipe_name: recipeName,
            },
            message: text || `${recipeName}을(를) 선물로 받았습니다.`,
            fromUserId: senderId,
            fromName: senderName,
          }),
        );
        return { ok: true as const };
      });
      if ("error" in txResult) {
        return new Response(txResult.error, { status: txResult.status });
      }
    } catch (e) {
      console.error("[inbox.send.recipe_gift] ", e);
      return new Response("internal error", { status: 500 });
    }
  } else {
    await db.insert(marketplaceInbox).values(
      inboxValues({
        userId: recipient.id,
        payload: { kind: "user_message", text },
        fromUserId: senderId,
        fromName: senderName,
      }),
    );
  }

  return Response.json({ ok: true, recipientName: recipient.name });
}
