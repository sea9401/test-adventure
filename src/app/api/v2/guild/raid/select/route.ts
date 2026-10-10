import { ensureUser } from "@/lib/server/ensureUser";
import { selectGuildRaidBoss } from "@/lib/server/guildRaidSelect";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";

const ERROR_STATUS = {
  no_guild: 403,
  forbidden: 403,
  event_ended: 410,
  bad_boss: 400,
  already_selected: 409,
} as const;

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:guild-raid:select",
    userLimit: 10,
    ipLimit: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: { bossId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const result = await selectGuildRaidBoss({ userId, bossId: body?.bossId });
  if (!result.ok) {
    return Response.json(result, { status: ERROR_STATUS[result.error] });
  }
  return Response.json(result);
}
