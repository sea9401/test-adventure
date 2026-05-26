import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  guildMembers,
  guilds,
  outpostOccupations,
  savesKv,
} from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";

// POST /api/v2/dev/reset-me — 본인 데이터 wipe (staging dev 도구).
//
// 정리 범위:
//   - 본인 savesKv 모든 키 삭제 (character.v2, training.v2, equipment.v2,
//     character-profile.v2, materials, 등)
//   - 본인 1인 길드면 길드 row 삭제 → cascade 로 guildMembers / guildResources /
//     guildLineups / guildLodge* / guildInvites / guildJoinRequests 정리
//   - 본인이 점령자 길드인 outpost_occupations row 삭제 (점령 해제)
//   - 다른 멤버가 있는 길드는 본인 leave 만 (다른 사람 데이터 보호)
//
// 다음 mount/사냥 시 ensureSoloGuild + 자동 캐릭 생성 흐름이 다시 돌아 깨끗한
// 새 캐릭 시작.
//
// 본문: { confirm: "RESET_MY_DATA" } — 우발적 호출 방지용 토큰.
// 라이브 prod 에선 IS_STAGING 게이트 (staging 외 → 404).

export async function POST(req: Request) {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.IS_STAGING !== "true"
  ) {
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { confirm?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (body.confirm !== "RESET_MY_DATA") {
    return Response.json(
      { ok: false, error: "missing_confirm" },
      { status: 400 },
    );
  }

  const result = await db.transaction(async (tx) => {
    // 1. 본인 멤버십 조회 → 1인 길드면 길드 통째 정리 가능.
    const member = (
      await tx
        .select({ guildId: guildMembers.guildId })
        .from(guildMembers)
        .where(eq(guildMembers.userId, userId))
        .limit(1)
    )[0];

    let guildDeleted = false;
    let leftGuildOnly = false;
    if (member) {
      const others = (
        await tx
          .select({ cnt: sql<number>`count(*)::int` })
          .from(guildMembers)
          .where(
            and(
              eq(guildMembers.guildId, member.guildId),
              ne(guildMembers.userId, userId),
            ),
          )
      )[0];
      const otherCount = others?.cnt ?? 0;

      if (otherCount === 0) {
        // 1인 길드 — outpost 점령 row 정리 후 길드 row 삭제 (cascade).
        await tx
          .delete(outpostOccupations)
          .where(eq(outpostOccupations.occupiedByGuildId, member.guildId));
        await tx.delete(guilds).where(eq(guilds.id, member.guildId));
        guildDeleted = true;
      } else {
        // 다른 멤버 있는 길드 — 본인만 leave (다른 사람 데이터 보호).
        await tx
          .delete(guildMembers)
          .where(
            and(
              eq(guildMembers.guildId, member.guildId),
              eq(guildMembers.userId, userId),
            ),
          );
        leftGuildOnly = true;
      }
    }

    // 2. savesKv 정리 — 마지막에 (길드 삭제가 succeed 한 후 정리).
    const deleted = await tx
      .delete(savesKv)
      .where(eq(savesKv.userId, userId))
      .returning({ key: savesKv.key });

    return {
      deletedKeys: deleted.length,
      keys: deleted.map((d) => d.key).sort(),
      guildDeleted,
      leftGuildOnly,
    };
  });

  return Response.json({ ok: true, ...result });
}
