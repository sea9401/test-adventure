import { ensureUser } from "@/lib/server/ensureUser";
import {
  ensureArenaTournament,
  placeArenaTournamentBet,
} from "@/lib/server/pvp/arenaTournamentService";

const STATUS_BY_ERROR: Record<string, number> = {
  not_open: 409,
  tournament_missing: 409,
  match_missing: 404,
  match_not_ready: 409,
  betting_closed: 409,
  invalid_choice: 400,
  own_match: 409,
  invalid_amount: 400,
  already_bet: 409,
  season_limit: 409,
  insufficient_gold: 409,
};

// POST /api/v2/arena/tournament/bet — 경기 시작 30초 전까지 경기당 1회 골드 베팅.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as {
    matchId?: unknown;
    chosenUserId?: unknown;
    amount?: unknown;
  } | null;
  if (
    typeof body?.matchId !== "string" ||
    typeof body.chosenUserId !== "string" ||
    typeof body.amount !== "number"
  ) {
    return Response.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  const now = new Date();
  const ensured = await ensureArenaTournament(now);
  if (ensured.kind !== "ok") {
    return Response.json({ ok: false, error: "not_open" }, { status: 409 });
  }
  const result = await placeArenaTournamentBet({
    userId,
    matchId: body.matchId,
    chosenUserId: body.chosenUserId,
    amount: body.amount,
    now,
  });
  if (result.kind !== "ok") {
    return Response.json(
      { ok: false, error: result.kind, remainingGold: result.remainingGold },
      { status: STATUS_BY_ERROR[result.kind] ?? 400 },
    );
  }
  return Response.json({ ok: true, amount: result.amount, gold: result.gold });
}
