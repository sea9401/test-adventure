import {
  GUILD_DINING_USER_SAVE_KEY,
  parseGuildDiningUserState,
} from "@/adventure/data/v2/guildDining";
import type { db } from "@/db";
import { guildMembers } from "@/db/schema";
import { kstWeekMondayKey } from "@/lib/kst";
import { reconcileWeeklyFacilitySourcesOnGuildJoin } from "./adventurerAssociation";
import { lockSaveForUpdate, upsertSave } from "./savesKv";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function reconcileGuildFacilitiesOnJoin(
  tx: Tx,
  userId: string,
  guildId: number,
  now: Date = new Date(),
): Promise<{ weekKey: string; transferred: string[] }> {
  const weekKey = kstWeekMondayKey(now);
  // 식당 라우트와 같은 잠금 순서(식당 개인 상태 → 시설 출처)를 유지한다.
  const diningRaw = await lockSaveForUpdate<Record<string, unknown>>(
    tx,
    userId,
    GUILD_DINING_USER_SAVE_KEY,
    {},
  );
  const transferred = await reconcileWeeklyFacilitySourcesOnGuildJoin(
    tx,
    userId,
    guildId,
    weekKey,
  );
  if (transferred.includes("dining_hall")) {
    await upsertSave(
      tx,
      userId,
      GUILD_DINING_USER_SAVE_KEY,
      parseGuildDiningUserState(diningRaw, { weekKey, guildId, now }),
    );
  }
  return { weekKey, transferred };
}

export async function addGuildMemberWithFacilityReconciliation(
  tx: Tx,
  userId: string,
  guildId: number,
  now: Date = new Date(),
): Promise<{ weekKey: string; transferred: string[] }> {
  await tx.insert(guildMembers).values({
    guildId,
    userId,
    role: "member",
  });
  return reconcileGuildFacilitiesOnJoin(tx, userId, guildId, now);
}
