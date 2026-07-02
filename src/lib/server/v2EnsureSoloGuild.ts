import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { guildMembers, guilds } from "@/db/schema";
import { convertSoloTilesToGuild } from "./tileOccupation";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// 현재 user 의 guildId 조회 (없으면 null = 무소속).
// v2 는 더 이상 자동 솔로 길드를 만들지 않는다 — 명시적 생성/가입만.
export async function getGuildId(
  tx: Tx,
  userId: string,
): Promise<number | null> {
  const existing = await tx
    .select({ guildId: guildMembers.guildId })
    .from(guildMembers)
    .where(eq(guildMembers.userId, userId))
    .limit(1);
  return existing[0]?.guildId ?? null;
}

// 위와 동일하되 트랜잭션 밖(db 직접) — 길드 워크숍/훈련장 라우트가 각자 재구현하던 것(2026-07 통합).
export async function getGuildIdByUser(userId: string): Promise<number | null> {
  const row = (
    await db
      .select({ guildId: guildMembers.guildId })
      .from(guildMembers)
      .where(eq(guildMembers.userId, userId))
      .limit(1)
  )[0];
  return row?.guildId ?? null;
}

// 길드 생성 — POST /api/v2/guild/create 가 호출. 이름 중복 23505 throw → 호출자가
// 사용자 친화 에러로 변환. lower(name) unique idx 기준.
export class GuildCreateError extends Error {
  constructor(public code: "name_taken" | "already_in_guild") {
    super(code);
  }
}

export async function createUserGuild(
  tx: Tx,
  userId: string,
  name: string,
): Promise<number> {
  // 이미 어떤 길드 멤버면 실패 — 클라 UX 가 막아야 정상이지만 race 방어.
  const existing = await tx
    .select({ guildId: guildMembers.guildId })
    .from(guildMembers)
    .where(eq(guildMembers.userId, userId))
    .limit(1);
  if (existing[0]) {
    throw new GuildCreateError("already_in_guild");
  }
  // 이름 중복 사전 체크 (lower).
  const dup = await tx
    .select({ id: guilds.id })
    .from(guilds)
    .where(sql`lower(${guilds.name}) = lower(${name})`)
    .limit(1);
  if (dup.length > 0) {
    throw new GuildCreateError("name_taken");
  }
  const inserted = await tx
    .insert(guilds)
    .values({ name, masterId: userId })
    .returning({ id: guilds.id });
  const guildId = inserted[0].id;
  await tx
    .insert(guildMembers)
    .values({ guildId, userId, role: "master" });
  // 길드 생성=가입 — 창립자의 솔로 타일 점령행을 새 길드로 전환(소유자 길드 동기화).
  await convertSoloTilesToGuild(tx, userId, guildId);
  return guildId;
}
