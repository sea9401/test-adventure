import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";
import { guildMembers, guilds } from "@/db/schema";
import type { DbExecutor } from "./savesKv";

// 멤버의 character.fame mutation 에 piggyback — 같은 delta 를 길드 fameTotal/
// fameAvailable 에도 가산. EPIC #3-4 (2026-05-19) 이후 서버 권위 fame 경로
// (questReward / dialogueReward 등) 안에서만 호출. 구 `/api/guilds/fame-contribute`
// 의 클라-신뢰 delta 를 대체 — 캐릭터 fame 이 서버에서 mutate 될 때 같은 트랜잭션
// 안에 길드 fame 도 함께 mutate 되어 양쪽이 자동 동기.
//
// 비-멤버 / 길드 disbanded / delta<=0 면 no-op.
export async function bumpGuildFameFromMember(
  tx: DbExecutor,
  userId: string,
  delta: number,
): Promise<void> {
  if (!Number.isFinite(delta) || delta <= 0) return;
  const memberRows = await tx
    .select({ guildId: guildMembers.guildId })
    .from(guildMembers)
    .where(eq(guildMembers.userId, userId))
    .limit(1);
  if (memberRows.length === 0) return;
  await tx
    .update(guilds)
    .set({
      fameTotal: sql`${guilds.fameTotal} + ${delta}`,
      fameAvailable: sql`${guilds.fameAvailable} + ${delta}`,
    })
    .where(
      and(eq(guilds.id, memberRows[0].guildId), isNull(guilds.disbandedAt)),
    );
}
