import { eq } from "drizzle-orm";
import { db } from "@/db";
import { guildMembers, users } from "@/db/schema";
import { ensureOriginalUser } from "@/lib/server/ensureUser";
import { getActiveAdminImpersonation } from "@/lib/server/adminImpersonation";
import { clearAffiliationInTx } from "@/lib/server/guildAffiliation";

// POST /api/account/delete — body { confirm: string }
// 회원 탈퇴. confirm 은 본인 인게임 닉네임(gameName)과 정확히 일치해야 한다 — 오작동/오클릭 방어.
// 닉네임 미설정 상태면 "탈퇴" 로 대체.
//
// users 행을 지우면 이 유저를 참조하는 모든 FK 가 onDelete:"cascade" 라
// 게임 세이브 / 거래소 listing·우편 / 길드 멤버십 / 랭킹 / 협동 보스 기여도·로그 /
// OAuth 계정·세션 / 자동 사냥 상태가 한 번에 정리된다.
//
// 길드 마스터인 경우 길드 자체가 cascade 로 사라지므로, 트랜잭션 안에서 남는 멤버들의
// 소속 표기(character.v2.affiliation)를 먼저 "무소속" 으로 정리한다 (disband 라우트와 동일 패턴).
//
// 주의: JWT 세션 쿠키가 클라이언트에 남아 있으면 다음 요청에서 ensureUser() 가
// users 행을 다시 만들어버린다 — 클라이언트는 성공 응답 직후 signOut() 으로 쿠키를 비워야 한다.
const FALLBACK_PHRASE = "탈퇴";

export async function POST(req: Request) {
  if (await getActiveAdminImpersonation()) {
    return Response.json(
      { error: "impersonation_active" },
      { status: 409 },
    );
  }
  const userId = await ensureOriginalUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  let body: { confirm?: unknown };
  try {
    body = (await req.json()) as { confirm?: unknown };
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  if (typeof body.confirm !== "string") {
    return new Response("confirmation mismatch", { status: 400 });
  }

  const [user] = await db
    .select({ gameName: users.gameName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const expected = user?.gameName?.trim() || FALLBACK_PHRASE;
  if (body.confirm.trim() !== expected) {
    return new Response("confirmation mismatch", { status: 400 });
  }

  await db.transaction(async (tx) => {
    const [membership] = await tx
      .select({ guildId: guildMembers.guildId, role: guildMembers.role })
      .from(guildMembers)
      .where(eq(guildMembers.userId, userId))
      .limit(1);
    if (membership?.role === "master") {
      const members = await tx
        .select({ userId: guildMembers.userId })
        .from(guildMembers)
        .where(eq(guildMembers.guildId, membership.guildId));
      for (const m of members) {
        if (m.userId !== userId) await clearAffiliationInTx(tx, m.userId);
      }
    }
    await tx.delete(users).where(eq(users.id, userId));
  });

  return Response.json({ ok: true });
}
