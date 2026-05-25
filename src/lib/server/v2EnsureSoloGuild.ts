import { and, eq, sql } from "drizzle-orm";
import type { db as dbType } from "@/db";
import { guildMembers, guilds, savesKv } from "@/db/schema";

type Tx = Parameters<Parameters<typeof dbType.transaction>[0]>[0];

// v2 자동 1인 길드 보장. idempotent.
//
// design: v2 의 모든 거점 점령은 길드 명의. 솔로 플레이어도 자기 이름의 1인
// 길드를 자동으로 갖게 해서 "거점 점령 = 길드 점령" 단일 흐름 유지.
//
// 흐름:
//   1. 이미 어떤 길드 멤버면 그 guildId 리턴 (idempotent).
//   2. character-profile.v2 의 name 으로 길드 생성 시도. 충돌 시 #XXXX suffix.
//   3. 멤버 INSERT (role=master).
//
// 라이브 길드 생성 조건(레벨/골드/의뢰)은 모두 우회 — v2 의 자동 시스템이므로.
// 라이브 길드원이 v2 들어와도 같은 길드 사용.
export async function ensureSoloGuild(
  tx: Tx,
  userId: string,
): Promise<number> {
  const existing = await tx
    .select({ guildId: guildMembers.guildId })
    .from(guildMembers)
    .where(eq(guildMembers.userId, userId))
    .limit(1);
  if (existing[0]) return existing[0].guildId;

  // 캐릭 이름 — character-profile.v2 의 name. 없거나 빈 문자열이면 "모험가".
  const profileRow = await tx
    .select({ value: savesKv.value })
    .from(savesKv)
    .where(
      and(
        eq(savesKv.userId, userId),
        eq(savesKv.key, "character-profile.v2"),
      ),
    )
    .limit(1);
  const profile = (profileRow[0]?.value ?? null) as { name?: string } | null;
  const rawName = profile?.name?.trim() || "모험가";
  // 라이브 길드 이름 규약 대충 — 최대 18자 정도까지.
  const baseName = rawName.slice(0, 18);

  // 충돌 체크 + suffix 후보군. unique idx 는 lower(name).
  const candidates: string[] = [baseName];
  for (let i = 0; i < 5; i++) {
    const suffix = Math.floor(Math.random() * 0x10000)
      .toString(16)
      .padStart(4, "0");
    candidates.push(`${baseName.slice(0, 13)}#${suffix}`);
  }

  let chosenName: string | null = null;
  for (const cand of candidates) {
    const dup = await tx
      .select({ id: guilds.id })
      .from(guilds)
      .where(sql`lower(${guilds.name}) = lower(${cand})`)
      .limit(1);
    if (dup.length === 0) {
      chosenName = cand;
      break;
    }
  }
  if (!chosenName) {
    throw new Error("ensureSoloGuild: name collisions exhausted");
  }

  // guilds INSERT — 이름 race 시 23505 throw (후보군 다 SELECT 통과한 직후 다른 tx
  // 가 동일 이름 INSERT 한 매우 드문 케이스). 호출자 retry 가능하게 throw.
  const inserted = await tx
    .insert(guilds)
    .values({ name: chosenName, masterId: userId })
    .returning({ id: guilds.id });
  const guildId = inserted[0].id;

  // guildMembers INSERT — userId unique idx. 동시 두 호출 race 시 두번째는
  // 23505 → onConflictDoNothing 으로 흡수. 그 경우 방금 만든 guilds row 정리 후
  // 실제 가입된 길드 id 재조회해서 리턴.
  const memberInsert = await tx
    .insert(guildMembers)
    .values({ guildId, userId, role: "master" })
    .onConflictDoNothing()
    .returning({ guildId: guildMembers.guildId });
  if (memberInsert.length > 0) {
    return guildId;
  }
  // race — 다른 호출이 이미 가입 완료. 우리가 만든 빈 길드 cleanup.
  await tx.delete(guilds).where(eq(guilds.id, guildId));
  const real = await tx
    .select({ guildId: guildMembers.guildId })
    .from(guildMembers)
    .where(eq(guildMembers.userId, userId))
    .limit(1);
  if (!real[0]) {
    throw new Error("ensureSoloGuild: race recovery failed");
  }
  return real[0].guildId;
}
