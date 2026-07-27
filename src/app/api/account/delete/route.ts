import { eq } from "drizzle-orm";
import { signOut } from "@/auth";
import { normalizeProfileImageUserId } from "@/adventure/profile/avatars";
import { db } from "@/db";
import {
  feedbackReports,
  guildMembers,
  guilds,
  storageDeletionQueue,
  users,
} from "@/db/schema";
import { ensureOriginalUser } from "@/lib/server/ensureUser";
import { getActiveAdminImpersonation } from "@/lib/server/adminImpersonation";
import { clearAffiliationInTx } from "@/lib/server/guildAffiliation";
import { requireActiveDeviceSession } from "@/lib/server/checkSession";
import { normalizeFeedbackImageObjectKey } from "@/lib/feedbackImage";
import { sendOpsAlert } from "@/lib/server/opsAlert";
import {
  processStorageDeletionQueue,
  type StorageDeletionKind,
} from "@/lib/server/storageDeletionQueue";

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
// 프로필 이미지 prefix·문의 첨부·함께 삭제되는 길드 엠블럼은 같은 트랜잭션에서 외부 저장소
// 삭제 큐에 기록한다. 커밋 뒤 즉시 R2 삭제를 시도하고, 실패분은 ops-retention 크론이 재시도한다.
//
// DB 삭제가 성공하면 같은 응답에서 Auth.js 세션 쿠키도 만료한다. 클라이언트의 후속
// signOut() 성공 여부에 계정 삭제의 완결성을 의존하지 않는다.
const FALLBACK_PHRASE = "탈퇴";

type StorageDeletionTarget = {
  kind: StorageDeletionKind;
  target: string;
};

async function processQueuedStorageSafely(ids: number[]) {
  if (ids.length === 0) return;
  try {
    const result = await processStorageDeletionQueue({ ids });
    if (result.failed > 0) {
      await sendOpsAlert("[ops] 회원 탈퇴 외부 파일 삭제 재시도 대기", {
        alertType: "privacy.storage_deletion_retry_pending",
        eventType: "privacy.storage_deletion.retry_pending",
        failed: result.failed,
        queueIds: ids,
      });
    }
  } catch (error) {
    console.error("account storage cleanup processing failed", error);
    await sendOpsAlert("[ops] 회원 탈퇴 외부 파일 삭제 큐 처리 실패", {
      alertType: "privacy.storage_deletion_queue_failed",
      eventType: "privacy.storage_deletion.queue_failed",
      queueIds: ids,
      error: error instanceof Error ? error.message : "unknown_error",
    });
  }
}

export async function POST(req: Request) {
  if (await getActiveAdminImpersonation()) {
    return Response.json(
      { error: "impersonation_active" },
      { status: 409 },
    );
  }
  const userId = await ensureOriginalUser();
  if (!userId) return new Response("unauthorized", { status: 401 });
  const sessionFail = await requireActiveDeviceSession(userId, req);
  if (sessionFail) return sessionFail;

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

  const queuedIds = await db.transaction(async (tx) => {
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

    const deletionTargets: StorageDeletionTarget[] = [];
    const profileUserId = normalizeProfileImageUserId(userId);
    if (profileUserId) {
      deletionTargets.push({ kind: "profile_user", target: profileUserId });
    }
    // membership role 이 어긋났거나 이미 해산 툼스톤 상태여도 master_id cascade 로
    // 사라지는 길드는 빠짐없이 prefix 삭제 대상으로 잡는다.
    const ownedGuilds = await tx
      .select({ id: guilds.id })
      .from(guilds)
      .where(eq(guilds.masterId, userId));
    for (const guild of ownedGuilds) {
      deletionTargets.push({ kind: "guild", target: String(guild.id) });
    }
    const feedbackImages = await tx
      .select({ imageKey: feedbackReports.imageKey })
      .from(feedbackReports)
      .where(eq(feedbackReports.userId, userId));
    for (const row of feedbackImages) {
      const imageKey = normalizeFeedbackImageObjectKey(row.imageKey);
      if (imageKey) {
        deletionTargets.push({ kind: "feedback_image", target: imageKey });
      }
    }
    const queued =
      deletionTargets.length > 0
        ? await tx
            .insert(storageDeletionQueue)
            .values(deletionTargets)
            .onConflictDoNothing()
            .returning({ id: storageDeletionQueue.id })
        : [];
    await tx.delete(users).where(eq(users.id, userId));
    return queued.map((row) => row.id);
  });

  await processQueuedStorageSafely(queuedIds);
  await signOut({ redirect: false });

  return Response.json({ ok: true });
}
