import { db } from "@/db";
import { ensureV2Character } from "@/lib/server/v2Character";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";
import { reconcileV2EquippedSkillsWithResult } from "@/lib/server/v2Skills";

export async function reconcileStateReadDependencies(
  userId: string,
  coreView: boolean,
) {
  return db.transaction(async (tx) => {
    const guildId = await getGuildId(tx, userId);
    const reconciled = await reconcileV2EquippedSkillsWithResult(tx, userId, {
      consumeJobSpNotice: !coreView,
    });
    await ensureV2Character(tx, userId);
    return { guildId, jobSpMigration: reconciled.migration };
  });
}
