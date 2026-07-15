import { db } from "@/db";
import { readSave } from "./savesKv";
import { enforceUserAndIpRateLimit } from "./userRateLimit";
import { ACTIVITY_GUARD_KEY, parseActivityGuardState } from "./activityGuard";
import { activityVerificationGateResponse } from "./activityGuardServer";

export async function enforceFarmingMutation(
  req: Request,
  userId: string,
): Promise<Response | null> {
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:farming:mutation",
    userLimit: 30,
    ipLimit: 180,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const guard = parseActivityGuardState(
    await readSave(db, userId, ACTIVITY_GUARD_KEY, {}),
  );
  return activityVerificationGateResponse(guard, "farming");
}
