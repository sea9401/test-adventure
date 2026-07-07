import { eq, sql } from "drizzle-orm";
import type { db as dbType } from "@/db";
import { guilds } from "@/db/schema";

type Tx = Parameters<Parameters<typeof dbType.transaction>[0]>[0];

// 길드 명성(fameTotal) 적립 — 길드원이 정착지 전쟁 명성(honor)을 획득할 때 같은 양만큼
//   길드 누적 명성에 더한다. (옛 길드 의뢰 시스템이 떠난 뒤 income 이 없던 동결값을 되살림.)
//   fameAvailable 도 함께 증가 — 설계상 둘은 같이 시작·같이 이동(total=누적·available=누적−소비).
//
// 🔒 단일 행 증분 UPDATE 라 자체 데드락 없음. 다만 같은 길드의 guild_resources 와 함께
//   쓰는 tx 는 전역 lock 순서를 지켜야 함 — guild_resources(lock) → guilds(이 UPDATE) 순서로.
//   delta<=0 이면 no-op.
export async function addGuildFame(
  tx: Tx,
  guildId: number,
  delta: number,
): Promise<void> {
  const inc = Math.floor(delta);
  if (!(inc > 0)) return;
  await tx
    .update(guilds)
    .set({
      fameTotal: sql`${guilds.fameTotal} + ${inc}`,
      fameAvailable: sql`${guilds.fameAvailable} + ${inc}`,
    })
    .where(eq(guilds.id, guildId));
}

export async function lockGuildFame(
  tx: Tx,
  guildId: number,
): Promise<{ fameTotal: number; fameAvailable: number } | null> {
  const row = (
    await tx
      .select({
        fameTotal: guilds.fameTotal,
        fameAvailable: guilds.fameAvailable,
      })
      .from(guilds)
      .where(eq(guilds.id, guildId))
      .for("update")
      .limit(1)
  )[0];
  if (!row) return null;
  return {
    fameTotal: Math.max(0, row.fameTotal),
    fameAvailable: Math.max(0, row.fameAvailable),
  };
}

export async function spendGuildFame(
  tx: Tx,
  guildId: number,
  cost: number,
): Promise<void> {
  const spend = Math.floor(cost);
  if (!(spend > 0)) return;
  await tx
    .update(guilds)
    .set({
      fameAvailable: sql`${guilds.fameAvailable} - ${spend}`,
    })
    .where(eq(guilds.id, guildId));
}
