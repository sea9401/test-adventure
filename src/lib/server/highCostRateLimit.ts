import { enforceUserAndIpRateLimit } from "./userRateLimit";

export const HIGH_COST_RATE_LIMITS = {
  arenaMatch: {
    action: "v2:arena:match",
    userLimit: 20,
    ipLimit: 100,
  },
  gridDungeonRead: {
    action: "v2:grid-dungeon:read",
    userLimit: 60,
    ipLimit: 300,
  },
  gridDungeonAction: {
    action: "v2:grid-dungeon:action",
    userLimit: 60,
    ipLimit: 240,
  },
  trainingSpar: {
    action: "v2:training:spar",
    userLimit: 20,
    ipLimit: 80,
  },
  offlineSettle: {
    action: "v2:me:offline-settle",
    userLimit: 40,
    ipLimit: 160,
  },
  outpostAttack: {
    action: "v2:outpost:attack",
    userLimit: 30,
    ipLimit: 150,
  },
} as const;

export type HighCostRateLimitKey = keyof typeof HIGH_COST_RATE_LIMITS;

const HIGH_COST_WINDOW_MS = 60_000;

export function enforceHighCostRateLimit(
  req: Request,
  userId: string,
  key: HighCostRateLimitKey,
  now?: number,
): Response | null {
  const profile = HIGH_COST_RATE_LIMITS[key];
  return enforceUserAndIpRateLimit(req, {
    userId,
    ...profile,
    windowMs: HIGH_COST_WINDOW_MS,
    now,
  });
}
