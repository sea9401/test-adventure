import { ensureUser } from "@/lib/server/ensureUser";
import { practiceGuildRaid } from "@/lib/server/guildRaidPractice";
import { enforceHighCostRateLimit } from "@/lib/server/highCostRateLimit";

const ERROR_STATUS = {
  no_guild: 403,
  no_character: 400,
  bad_boss: 400,
  event_ended: 410,
} as const;

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceHighCostRateLimit(req, userId, "guildRaidPractice");
  if (limited) return limited;

  // 예전 클라이언트는 본문 없이 요청한다. 본문이 없거나 JSON이 아니면 보스 지정 없이 연습한다.
  const body = (await req.json().catch(() => null)) as { bossId?: unknown } | null;
  const result = await practiceGuildRaid({ userId, bossId: body?.bossId });
  if (!result.ok) {
    return Response.json(result, { status: ERROR_STATUS[result.error] });
  }
  return Response.json(result);
}
