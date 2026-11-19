import { eq } from "drizzle-orm";
import { db } from "@/db";
import { outpostVillages } from "@/db/schema";
import { associationFacilityLevel } from "./adventurerAssociation";
import type { AdventureFacilityContext } from "./adventureDashboard";
import { settlementBuildingSummaryFromRows } from "./guildFacilities";
import { getGuildIdByUser } from "./v2EnsureSoloGuild";

/**
 * 오늘의 모험 체크가 훈련장과 제작소 항목을 계산할 때 쓰는 시설 레벨.
 * 길드원은 길드 시설, 길드가 없는 계정은 모험가 협회 훈련장을 본다.
 */
export async function readAdventureFacilityContext(
  userId: string,
): Promise<AdventureFacilityContext> {
  const guildId = await getGuildIdByUser(userId);
  if (guildId == null) {
    return {
      scope: "association",
      trainingGroundLevel: await associationFacilityLevel(db, "training_ground"),
    };
  }
  const rows = await db
    .select({ buildings: outpostVillages.buildings })
    .from(outpostVillages)
    .where(eq(outpostVillages.guildId, guildId));
  const { levels } = settlementBuildingSummaryFromRows(rows);
  return {
    scope: "guild",
    trainingGroundLevel: levels.training_ground,
    smithyLevel: levels.guild_smithy,
  };
}
