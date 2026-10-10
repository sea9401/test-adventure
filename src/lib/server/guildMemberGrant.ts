import { eq } from "drizzle-orm";
import type { db as dbType } from "@/db";
import { guildMembers } from "@/db/schema";
import type { GuildMemberGrantOutput } from "@/adventure/data/v2/guildMemberGrant";
import {
  grantStaminaPotions,
  STAMINA_POTIONS_KEY,
} from "@/adventure/v2/staminaPotions";
import {
  lockSaveForUpdate,
  upsertSave,
  type DbExecutor,
} from "@/lib/server/savesKv";

type Tx = Parameters<Parameters<typeof dbType.transaction>[0]>[0];

export function isGuildMemberGrantOutput(output: {
  kind: string;
}): output is GuildMemberGrantOutput {
  return (
    output.kind === "material" ||
    output.kind === "stamina_potion" ||
    output.kind === "mastery_certificate"
  );
}

// 받는 사람의 세이브를 먼저 잠그고, 적용 함수를 돌려준다. 호출부는 모든 수령자를
// 잠근 뒤 한꺼번에 적용해 한 명이라도 실패하면 트랜잭션 전체를 되돌린다.
export async function lockGuildMemberGrant(
  tx: Tx,
  userId: string,
  output: GuildMemberGrantOutput,
): Promise<() => Promise<void>> {
  if (output.kind === "material") {
    const char = await lockSaveForUpdate<Record<string, unknown>>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const materials =
      char.materials && typeof char.materials === "object"
        ? { ...(char.materials as Record<string, unknown>) }
        : {};
    const current = Math.max(
      0,
      Math.floor(Number(materials[output.materialId]) || 0),
    );
    materials[output.materialId] = current + output.count;
    return () => upsertSave(tx, userId, "character.v2", { ...char, materials });
  }
  if (output.kind === "stamina_potion") {
    const raw = await lockSaveForUpdate(tx, userId, STAMINA_POTIONS_KEY, {});
    const next = grantStaminaPotions(raw, output.count, { bound: true });
    return () => upsertSave(tx, userId, STAMINA_POTIONS_KEY, next);
  }
  const inventory = await lockSaveForUpdate<Record<string, unknown>>(
    tx,
    userId,
    "inventory.v2",
    {},
  );
  const current = Math.max(
    0,
    Math.floor(Number(inventory[output.itemKey]) || 0),
  );
  return () =>
    upsertSave(tx, userId, "inventory.v2", {
      ...inventory,
      [output.itemKey]: current + output.count,
    });
}

export async function guildMemberIds(
  tx: DbExecutor,
  guildId: number,
): Promise<string[]> {
  const rows = await tx
    .select({ userId: guildMembers.userId })
    .from(guildMembers)
    .where(eq(guildMembers.guildId, guildId));
  return [...new Set(rows.map((row) => row.userId))].sort();
}
