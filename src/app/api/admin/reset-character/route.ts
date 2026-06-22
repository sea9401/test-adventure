import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin, currentAdminEmail } from "@/lib/server/isAdmin";
import { logAdminAction } from "@/lib/server/adminAudit";
import { resetUserCharacterData } from "@/lib/server/resetCharacterData";

// POST /api/admin/reset-character — body { userId, confirm }
// 관리자 전용(requireAdmin/ADMIN_EMAILS). 대상 유저의 캐릭터 데이터를 초기화한다(로그인 유지).
// dev/reset-me 와 동일 로직(resetUserCharacterData) 을 타겟 유저에 적용.
//
// 안전장치: confirm 은 대상의 인게임 닉네임(gameName)과 정확히 일치해야 한다 — 다른 유저를
//   잘못 초기화하는 오클릭/대상 혼동 방지. 닉네임 미설정이면 "초기화" 로 대체.
export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (gate) return gate;

  let body: { userId?: unknown; confirm?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const userId = typeof body.userId === "string" ? body.userId : "";
  if (!userId) {
    return Response.json({ ok: false, error: "invalid_user" }, { status: 400 });
  }

  const [target] = await db
    .select({ gameName: users.gameName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!target) {
    return Response.json(
      { ok: false, error: "user_not_found" },
      { status: 404 },
    );
  }
  // 닉네임이 없으면 userId 로 대체 — 무명 유저끼리 같은 confirm 을 공유하지 않도록(고유).
  const expected = target.gameName?.trim() || userId;
  if (typeof body.confirm !== "string" || body.confirm.trim() !== expected) {
    return Response.json(
      { ok: false, error: "confirm_mismatch", expected },
      { status: 400 },
    );
  }

  const result = await db.transaction((tx) =>
    resetUserCharacterData(tx, userId),
  );

  await logAdminAction({
    adminEmail: await currentAdminEmail(),
    action: "reset-character",
    targetUserId: userId,
    detail: { gameName: target.gameName },
  });

  return Response.json({ ok: true, ...result });
}
