import { eq } from "drizzle-orm";
import { db } from "@/db";
import { pvpTournaments } from "@/db/schema";
import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";
import {
  arenaTournamentParticipantForPublic,
  arenaTournamentReplayForPublic,
  type ArenaTournamentBracket,
} from "@/lib/server/pvp/arenaTournament";
import { ensureUser } from "@/lib/server/ensureUser";

type Ctx = {
  params: Promise<{ seasonId: string; matchId: string }>;
};

function replayPayload(value: unknown): ReplayPayload | null {
  if (!value || typeof value !== "object") return null;
  const replay = value as Partial<ReplayPayload>;
  if (!replay.enemy || typeof replay.enemy !== "object") return null;
  if (!Number.isFinite(replay.playerMaxHp)) return null;
  if (!Number.isFinite(replay.playerMaxMp)) return null;
  if (!Array.isArray(replay.log) || replay.log.length === 0) return null;
  return replay as ReplayPayload;
}

// 과거 시즌에도 유지되는 본선 경기별 리플레이. 목록 API는 로그를 싣지 않고
// 채팅/대진표의 명시적 링크로 들어온 경우에만 이 단건 API가 bracket JSON을 읽는다.
export async function GET(_req: Request, { params }: Ctx) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { seasonId, matchId } = await params;
  if (
    seasonId.length < 1 ||
    seasonId.length > 100 ||
    matchId.length < 1 ||
    matchId.length > 180
  ) {
    return Response.json({ ok: false, error: "invalid_match" }, { status: 400 });
  }

  const [row] = await db
    .select({ bracket: pvpTournaments.bracket })
    .from(pvpTournaments)
    .where(eq(pvpTournaments.seasonId, seasonId))
    .limit(1);
  const bracket = row?.bracket as ArenaTournamentBracket | undefined;
  const match = bracket?.matches.find((candidate) => candidate.id === matchId);
  if (!bracket || !match || match.status !== "completed") {
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  const participantById = new Map(
    bracket.participants.map((participant) => [participant.userId, participant]),
  );
  const p1 = participantById.get(match.p1UserId ?? "");
  const p2 = participantById.get(match.p2UserId ?? "");
  if (!p1 || !p2) {
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  const games = match.games.flatMap((game) => {
    const replay = replayPayload(game.replay);
    return replay
      ? [
          {
            ...game,
            replay: arenaTournamentReplayForPublic(bracket, replay),
            hasReplay: true,
          },
        ]
      : [];
  });
  if (games.length === 0) {
    return Response.json({ ok: false, error: "no_replay" }, { status: 404 });
  }

  return Response.json({
    ok: true,
    seasonId,
    match: {
      id: match.id,
      kind: match.kind,
      roundName: match.roundName,
      sequence: match.sequence,
      scheduledAt: match.scheduledAt,
      p1: arenaTournamentParticipantForPublic(bracket, p1),
      p2: arenaTournamentParticipantForPublic(bracket, p2),
      p1Wins: match.p1Wins,
      p2Wins: match.p2Wins,
      winnerUserId: match.winnerUserId,
      decidedBy: match.decidedBy,
      games,
    },
  });
}
