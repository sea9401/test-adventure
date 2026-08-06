"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FilmStrip, Trophy } from "@phosphor-icons/react";
import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";
import type { Avatar } from "@/adventure/profile/avatars";
import { ReplayBattleScene } from "@/adventure/v2/ReplayBattleScene";
import { Card } from "@/components/ui/Card";
import { LoadErrorBanner } from "@/components/ui/LoadErrorBanner";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { SURFACE_INSET } from "@/components/ui/surfaces";

type Participant = {
  userId: string;
  name: string;
  avatar?: Avatar;
  level: number;
  qualifyingRank: number;
};

type TournamentReplayGame = {
  game: number;
  outcome: "p1_win" | "p2_win" | "draw";
  turns: number;
  replay: ReplayPayload;
};

type TournamentReplayResponse =
  | {
      ok: true;
      seasonId: string;
      match: {
        id: string;
        kind: "elimination" | "third_place" | "final";
        roundName: string;
        sequence: number;
        scheduledAt: string;
        p1: Participant;
        p2: Participant;
        p1Wins: number;
        p2Wins: number;
        winnerUserId: string;
        decidedBy: "wins" | "hp" | "seed";
        games: TournamentReplayGame[];
      };
    }
  | { ok?: false; error?: string };

function formatKst(iso: string): string {
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function decisionLabel(decidedBy: "wins" | "hp" | "seed"): string {
  if (decidedBy === "hp") return "잔여 HP 판정";
  if (decidedBy === "seed") return "예선 순위 판정";
  return "다승 판정";
}

export function V2ArenaTournamentReplayView({
  seasonId,
  matchId,
}: {
  seasonId: string;
  matchId: string;
}) {
  const router = useRouter();
  const [data, setData] = useState<Extract<TournamentReplayResponse, { ok: true }> | null>(
    null,
  );
  const [selectedGame, setSelectedGame] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    setNotFound(false);
    try {
      const response = await fetch(
        `/api/v2/arena/tournament/${encodeURIComponent(seasonId)}/matches/${encodeURIComponent(matchId)}`,
      );
      const json = (await response.json().catch(() => null)) as
        | TournamentReplayResponse
        | null;
      if (response.status === 404) {
        setData(null);
        setNotFound(true);
      } else if (!response.ok || !json?.ok) {
        setData(null);
        setLoadError(true);
      } else {
        setData(json);
        setSelectedGame(json.match.games[0]?.game ?? 1);
      }
    } catch {
      setData(null);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [matchId, seasonId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 링크 진입 시 단건 리플레이 조회
    void load();
  }, [load]);

  const match = data?.match ?? null;
  const game = match?.games.find((candidate) => candidate.game === selectedGame);
  const winner = match
    ? match.winnerUserId === match.p1.userId
      ? match.p1
      : match.p2
    : null;

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader
        title={
          <>
            <FilmStrip size={20} weight="duotone" className="text-amber-600" />
            아레나 본선 전투 로그
          </>
        }
        onBack={() => router.push("/battle/arena")}
      />

      {loadError && <LoadErrorBanner onRetry={load} />}

      {loading && (
        <Card padding="lg" className="text-center text-sm text-zinc-500">
          전투 기록을 불러오는 중…
        </Card>
      )}

      {!loading && notFound && (
        <Card padding="lg" className="space-y-3 text-center">
          <p className="text-sm font-semibold">전투 기록을 찾을 수 없어요.</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            이전 방식으로 진행된 경기이거나 기록이 남아 있지 않습니다.
          </p>
          <button
            type="button"
            onClick={() => router.push("/battle/arena")}
            className="rounded-md bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700"
          >
            아레나로 돌아가기
          </button>
        </Card>
      )}

      {!loading && match && game && winner && (
        <>
          <Card padding="md" className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                  <Trophy size={14} /> {match.roundName} #{match.sequence}
                </div>
                <div className="mt-1 text-lg font-bold">
                  {match.p1.name} {match.p1Wins}:{match.p2Wins} {match.p2.name}
                </div>
                <div className="mt-1 text-sm text-emerald-700 dark:text-emerald-300">
                  {winner.name} 승리 · {decisionLabel(match.decidedBy)}
                </div>
              </div>
              <div className="text-right text-xs text-zinc-500 dark:text-zinc-400">
                <div>{formatKst(match.scheduledAt)}</div>
                <div className="mt-1">{data?.seasonId ?? seasonId}</div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-700">
              {match.games.map((candidate) => (
                <button
                  key={candidate.game}
                  type="button"
                  onClick={() => setSelectedGame(candidate.game)}
                  className={`${SURFACE_INSET} px-3 py-1.5 text-xs font-semibold ${
                    candidate.game === selectedGame
                      ? "border-amber-500 text-amber-700 dark:text-amber-300"
                      : "text-zinc-600 dark:text-zinc-300"
                  }`}
                >
                  {candidate.game}경기 · {candidate.turns}행동
                </button>
              ))}
            </div>
          </Card>

          <ReplayBattleScene
            key={`${match.id}-${game.game}`}
            payload={game.replay}
            playerName={match.p1.name}
            gender={match.p1.avatar ?? "male1"}
            exp={0}
            maxExp={1}
            playerSubtitle={`${match.roundName} ${game.game}경기`}
            outcome={
              game.outcome === "p1_win"
                ? "win"
                : game.outcome === "p2_win"
                  ? "lose"
                  : undefined
            }
          />
        </>
      )}
    </main>
  );
}
