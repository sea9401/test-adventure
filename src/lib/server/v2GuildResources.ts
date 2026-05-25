import { eq } from "drizzle-orm";
import type { db as dbType } from "@/db";
import { v2GuildResources } from "@/db/schema";

type Tx = Parameters<Parameters<typeof dbType.transaction>[0]>[0];

export type V2GuildResources = {
  stone: number;
  soldiers: number;
  scrolls: number;
};

// row 가 없으면 빈 row 보장 (race-safe). SELECT FOR UPDATE 가 잠금 잡으려면
// row 가 있어야 하므로.
async function ensureRow(tx: Tx, guildId: number): Promise<void> {
  await tx
    .insert(v2GuildResources)
    .values({ guildId, stone: 0, soldiers: 0, scrolls: 0 })
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
      .select({
        stone: v2GuildResources.stone,
        soldiers: v2GuildResources.soldiers,
        scrolls: v2GuildResources.scrolls,
      })
      .from(v2GuildResources)
      .where(eq(v2GuildResources.guildId, guildId))
      .for("update")
      .limit(1)
  )[0];
  return {
    stone: Math.max(0, row?.stone ?? 0),
    soldiers: Math.max(0, row?.soldiers ?? 0),
    scrolls: Math.max(0, row?.scrolls ?? 0),
  };
}

// 두 길드의 자원을 사전 정렬 lock (cross-tx 데드락 회피).
// 같은 길드 인자면 한 번만 lock — 호출자가 책임지고 같은 길드 안 넘김.
export async function lockTwoGuildResources(
  tx: Tx,
  guildIdA: number,
  guildIdB: number,
): Promise<{ a: V2GuildResources; b: V2GuildResources }> {
  if (guildIdA === guildIdB) {
    throw new Error("lockTwoGuildResources: same guild");
  }
  const [first, second] = [guildIdA, guildIdB].sort((x, y) => x - y);
  const firstRes = await lockGuildResources(tx, first);
  const secondRes = await lockGuildResources(tx, second);
  return {
    a: guildIdA === first ? firstRes : secondRes,
    b: guildIdA === first ? secondRes : firstRes,
  };
}

export async function upsertGuildResources(
  tx: Tx,
  guildId: number,
  resources: V2GuildResources,
): Promise<void> {
  const safe = {
    stone: Math.max(0, resources.stone),
    soldiers: Math.max(0, resources.soldiers),
    scrolls: Math.max(0, resources.scrolls),
  };
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
      .select({
        stone: v2GuildResources.stone,
        soldiers: v2GuildResources.soldiers,
        scrolls: v2GuildResources.scrolls,
      })
      .from(v2GuildResources)
      .where(eq(v2GuildResources.guildId, guildId))
      .limit(1)
  )[0];
  if (!row) return { stone: 0, soldiers: 0, scrolls: 0 };
  return {
    stone: Math.max(0, row.stone),
    soldiers: Math.max(0, row.soldiers),
    scrolls: Math.max(0, row.scrolls),
  };
}
