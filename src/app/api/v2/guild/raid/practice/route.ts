import { ensureUser } from "@/lib/server/ensureUser";
import { practiceGuildRaid } from "@/lib/server/guildRaidPractice";
import { enforceHighCostRateLimit } from "@/lib/server/highCostRateLimit";

const ERROR_STATUS = {
  no_guild: 403,
  no_character: 400,
  bad_boss: 500,
  event_ended: 410,
} as const;

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceHighCostRateLimit(req, userId, "guildRaidPractice");
  if (limited) return limited;

  const result = await practiceGuildRaid({ userId });
  if (!result.ok) {
    return Response.json(result, { status: ERROR_STATUS[result.error] });
  }
  return Response.json(result);
}
