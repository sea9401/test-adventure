import { ensureUser } from "@/lib/server/ensureUser";
import { claimGuildRaidReward } from "@/lib/server/guildRaidRewardClaim";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";

const ERROR_STATUS = {
  claim_not_open: 409,
  not_settled: 409,
  not_eligible: 403,
  already_claimed: 409,
  reward_expired: 410,
} as const;

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:guild-raid:claim",
    userLimit: 10,
    ipLimit: 50,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const result = await claimGuildRaidReward({ userId });
  if (!result.ok) {
    return Response.json(result, { status: ERROR_STATUS[result.error] });
  }
  return Response.json(result);
}
