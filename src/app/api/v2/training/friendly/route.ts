import { ensureUser } from "@/lib/server/ensureUser";
import { enforceHighCostRateLimit } from "@/lib/server/highCostRateLimit";
import {
  checkUserRateLimit,
  userRateLimitResponse,
} from "@/lib/server/userRateLimit";
import {
  prepareFriendlySparringCombatant,
  resolveFriendlySparringTarget,
} from "@/lib/server/friendlySparring";
import { resolveBattlePvP } from "@/adventure/v2/combat/engine-pvp";
import { autoDuelContext } from "@/adventure/v2/combat/duelOptions";
import { toPvpReplayPayload } from "@/adventure/data/v2/replayPayload";
import {
  ARENA_DAMAGE_MULTIPLIER,
  ARENA_SUSTAIN_MULTIPLIER,
} from "@/lib/server/arena";

export const FRIENDLY_SPARRING_COOLDOWN_MS = 10_000;

function unauthorized() {
  return Response.json(
    { ok: false, error: "unauthorized" },
    { status: 401 },
  );
}

function targetNotFound() {
  return Response.json(
    { ok: false, error: "target_not_found" },
    { status: 404 },
  );
}

export async function GET(req: Request) {
  const userId = await ensureUser();
  if (!userId) return unauthorized();

  const name = new URL(req.url).searchParams.get("name")?.trim() ?? "";
  if (!name) {
    return Response.json(
      { ok: false, error: "bad_request" },
      { status: 400 },
    );
  }
  const target = await resolveFriendlySparringTarget(userId, name);
  if (!target) return targetNotFound();

  return Response.json({
    ok: true,
    target: {
      name: target.name,
      level: target.level,
      avatar: target.avatar,
      profileBorder: target.profileBorder,
    },
  });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return unauthorized();

  const limited = enforceHighCostRateLimit(req, userId, "friendlySparring");
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const targetName =
    typeof (body as { targetName?: unknown } | null)?.targetName === "string"
      ? ((body as { targetName: string }).targetName.trim())
      : "";
  if (!targetName) {
    return Response.json(
      { ok: false, error: "bad_request" },
      { status: 400 },
    );
  }

  const target = await resolveFriendlySparringTarget(userId, targetName);
  if (!target) return targetNotFound();

  const [viewer, opponent] = await Promise.all([
    prepareFriendlySparringCombatant(userId),
    prepareFriendlySparringCombatant(target.userId),
  ]);
  if (!viewer) {
    return Response.json(
      { ok: false, error: "no_character" },
      { status: 400 },
    );
  }
  if (!opponent) return targetNotFound();

  const cooldown = checkUserRateLimit({
    userId,
    action: "v2:training:friendly:cooldown",
    limit: 1,
    windowMs: FRIENDLY_SPARRING_COOLDOWN_MS,
  });
  if (!cooldown.ok) {
    const response = userRateLimitResponse(cooldown.retryAfterSec);
    return Response.json(
      {
        ok: false,
        error: "cooldown",
        retryAfterSec: cooldown.retryAfterSec,
      },
      { status: response.status, headers: response.headers },
    );
  }

  const battle = resolveBattlePvP(
    viewer.player,
    opponent.player,
    viewer.name,
    opponent.name,
    {
      ...autoDuelContext(),
      damageMultiplier: ARENA_DAMAGE_MULTIPLIER,
      sustainMultiplier: ARENA_SUSTAIN_MULTIPLIER,
      v2Skills: { p1: viewer.skills, p2: opponent.skills },
    },
  );
  const outcome =
    battle.outcome === "p1_win"
      ? "win"
      : battle.outcome === "p2_win"
        ? "loss"
        : "draw";

  return Response.json({
    ok: true,
    result: {
      outcome,
      turns: battle.turns,
      opponent: { name: opponent.name, level: opponent.level },
      replay: toPvpReplayPayload(battle.finalState, opponent.name),
      startPlayerHp: viewer.player.hp,
      cooldownMs: FRIENDLY_SPARRING_COOLDOWN_MS,
    },
  });
}
