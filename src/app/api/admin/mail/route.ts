import { eq } from "drizzle-orm";
import { db } from "@/db";
import { marketplaceInbox, users } from "@/db/schema";
import { requireAdmin, currentAdminEmail } from "@/lib/server/isAdmin";
import { logAdminAction } from "@/lib/server/adminAudit";
import { inboxValues } from "@/lib/server/inboxPayload";

// POST /api/admin/mail — 운영자 대량 우편(골드 + 메시지)을 한 유저 또는 전체 유저에게 발송.
//   body: { target: "user" | "all", userId?, gold, message? }
// 우편함(marketplace_inbox)에 kind='admin_gift' 행으로 적재 → 수신자가 우편함에서 수령(claim)
// 시 골드 지급. fromName="운영자". 모든 발송은 감사 로그에 기록.
//
// ⚠️ target="all" 은 전체 유저에게 골드를 지급하는 강력한 작업 — 관리자 UI 에서 2단계 확인.
const MESSAGE_MAX = 300;

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (gate) return gate;
  const adminEmail = await currentAdminEmail();

  let body: {
    target?: unknown;
    userId?: unknown;
    gold?: unknown;
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
      ? Math.trunc(body.gold)
      : 0;
  const message =
    typeof body.message === "string" ? body.message.trim().slice(0, MESSAGE_MAX) : "";

  if (gold <= 0) {
    return Response.json(
      { ok: false, error: "gold must be > 0" },
      { status: 400 },
    );
  }

  const payload = { kind: "admin_gift" as const, gold };
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
      return Response.json({ ok: true, target, recipients: 0, gold });
    }
    await db.insert(marketplaceInbox).values(all.map((u) => mkRow(u.id)));
    recipients = all.length;
  }

  await logAdminAction({
    adminEmail,
    action: target === "all" ? "mail.broadcast" : "mail.user",
    targetUserId: target === "user" ? (body.userId as string) : null,
    detail: { gold, recipients, message: message || undefined },
  });

  return Response.json({ ok: true, target, recipients, gold });
}
