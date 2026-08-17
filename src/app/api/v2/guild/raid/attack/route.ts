import { ensureUser } from "@/lib/server/ensureUser";
import {
  attackGuildRaid,
  validGuildRaidRequestId,
} from "@/lib/server/guildRaidAttack";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";

const ERROR_STATUS = {
  no_guild: 403,
  no_character: 400,
  bad_boss: 500,
  daily_limit: 429,
  guild_locked: 409,
  event_ended: 410,
} as const;

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:guild-raid:attack",
    userLimit: 20,
    ipLimit: 100,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: { requestId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const requestId = typeof body.requestId === "string" ? body.requestId : "";
  if (!validGuildRaidRequestId(requestId)) {
    return Response.json({ ok: false, error: "bad_request_id" }, { status: 400 });
  }
  const result = await attackGuildRaid({ userId, requestId });
  if (!result.ok) {
    return Response.json(result, { status: ERROR_STATUS[result.error] });
  }
  return Response.json(result);
}
