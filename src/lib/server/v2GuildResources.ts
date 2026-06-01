import { eq } from "drizzle-orm";
import type { db as dbType } from "@/db";
import { v2GuildResources } from "@/db/schema";

type Tx = Parameters<Parameters<typeof dbType.transaction>[0]>[0];

// 길드 공용 자원 풀. 옛 stone/scrolls/soldiers 자원 경제는 폐기 — 남은 건 거점
// 세금 회수로 누적되는 공용 gold 풀뿐. (DROP COLUMN 마이그레이션으로 정리 완료.)

export type V2GuildResources = {
  // 거점 세금 회수 시 90% 가 누적. 회수자 본인 10% 와 별개.
  gold: number;
};

function rowToResources(row: { gold: number | null }): V2GuildResources {
  return { gold: Math.max(0, row.gold ?? 0) };
}

// row 가 없으면 빈 row 보장 (race-safe). SELECT FOR UPDATE 가 잠금 잡으려면
// row 가 있어야 하므로.
async function ensureRow(tx: Tx, guildId: number): Promise<void> {
  await tx
    .insert(v2GuildResources)
    .values({ guildId, gold: 0 })
    .onConflictDoNothing();
}

// 길드 자원 lock + read.
export async function lockGuildResources(
  tx: Tx,
  guildId: number,
): Promise<V2GuildResources> {
  await ensureRow(tx, guildId);
  const row = (
    await tx
      .select({ gold: v2GuildResources.gold })
      .from(v2GuildResources)
      .where(eq(v2GuildResources.guildId, guildId))
      .for("update")
      .limit(1)
  )[0];
  if (!row) {
    return { gold: 0 };
  }
  return rowToResources(row);
}

export async function upsertGuildResources(
  tx: Tx,
  guildId: number,
  resources: V2GuildResources,
): Promise<void> {
  const safe = { gold: Math.max(0, resources.gold) };
  await tx
    .insert(v2GuildResources)
    .values({
      guildId,
      ...safe,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: v2GuildResources.guildId,
      set: {
        ...safe,
        updatedAt: new Date(),
      },
    });
}

// viewer 의 길드 자원 read only (lock 없이). UI 표시용.
export async function readGuildResources(
  tx: Tx,
  guildId: number,
): Promise<V2GuildResources> {
  const row = (
    await tx
      .select({ gold: v2GuildResources.gold })
      .from(v2GuildResources)
      .where(eq(v2GuildResources.guildId, guildId))
      .limit(1)
  )[0];
  if (!row) {
    return { gold: 0 };
  }
  return rowToResources(row);
}
