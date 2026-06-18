import { and, eq, ne, sql } from "drizzle-orm";
import {
  guildMembers,
  guilds,
  outpostOccupations,
  savesKv,
} from "@/db/schema";
import type { DbExecutor } from "./savesKv";

export type ResetCharacterResult = {
  deletedKeys: number;
  keys: string[];
  guildDeleted: boolean;
  leftGuildOnly: boolean;
};

// 한 유저의 캐릭터 데이터를 초기화한다(계정/로그인은 유지 — users 행·OAuth 불변).
// dev/reset-me(본인) 과 admin reset-character(타겟) 공용 로직. 반드시 tx 안에서 호출.
//
// 정리 범위:
//   - 본인 savesKv 모든 키 삭제(character.v2 / proficiency.v2 / equipment.v2 /
//     inventory.v2 / character-profile.v2 / 지갑·도감·퀘스트 등 전부)
//     → 다음 mount 시 자동 캐릭 생성 흐름(needsSetup)으로 깨끗한 새 캐릭 시작(무소속).
//   - 본인 1인 길드면 길드 row 삭제 → cascade 로 guildMembers / guildResources /
//     guildLineups / guildLodge* / guildInvites / guildJoinRequests 정리 + 점령 거점 해제.
//   - 다른 멤버가 있는 길드는 본인 leave 만(다른 사람 데이터 보호).
//
// 의도적으로 남기는 것: users 행(닉네임 gameName 포함 — 재생성 시 같은 이름 유지) · OAuth
//   계정/세션 · 게시판/피드/메시지 등 커뮤니티 흔적(본인 캐릭터 데이터 아님).
export async function resetUserCharacterData(
  tx: DbExecutor,
  userId: string,
): Promise<ResetCharacterResult> {
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
      // 1인 길드 — outpost 점령 row 정리 후 길드 row 삭제(cascade).
      await tx
        .delete(outpostOccupations)
        .where(eq(outpostOccupations.occupiedByGuildId, member.guildId));
      await tx.delete(guilds).where(eq(guilds.id, member.guildId));
      guildDeleted = true;
    } else {
      // 다른 멤버 있는 길드 — 본인만 leave(다른 사람 데이터 보호).
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

  // 2. savesKv 정리 — 마지막에(길드 삭제가 succeed 한 후 정리).
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
}
