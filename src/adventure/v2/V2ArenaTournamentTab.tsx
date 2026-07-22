"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Crown, Trophy } from "@phosphor-icons/react";
import { LoadErrorBanner } from "@/components/ui/LoadErrorBanner";
import {
  SURFACE_ACCENT,
  SURFACE_CARD,
  SURFACE_INSET,
} from "@/components/ui/surfaces";
import type { ArenaTournamentBracket } from "@/lib/server/pvp/arenaTournament";

type TournamentResponse = {
  ok?: boolean;
  phase?: "ranked" | "tournament" | "closed";
  season?: {
    id: string;
    rankedEndsAt: string;
    endAt: string;
  };
  tournament?: {
    seasonId: string;
    isCurrent: boolean;
    bracket: ArenaTournamentBracket;
    myReward: { placement: string; coins: number } | null;
  } | null;
};

function formatKst(iso: string | undefined): string {
  if (!iso) return "-";
  const value = new Date(iso);
  if (!Number.isFinite(value.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export function V2ArenaTournamentTab() {
  const [data, setData] = useState<TournamentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const response = await fetch("/api/v2/arena/tournament");
      const json = (await response.json().catch(() => null)) as
        | TournamentResponse
        | null;
      if (!response.ok || !json?.ok) setFailed(true);
      else setData(json);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 탭 마운트 1회 fetch
    load();
  }, [load]);

  const tournament = data?.tournament;
  const bracket = tournament?.bracket;
  const participantById = useMemo(
    () =>
      new Map(
        (bracket?.participants ?? []).map((participant) => [
          participant.userId,
          participant,
        ]),
      ),
    [bracket?.participants],
  );
  const rounds = useMemo(() => {
    const grouped = new Map<number, NonNullable<typeof bracket>["matches"]>();
    for (const match of bracket?.matches ?? []) {
      const matches = grouped.get(match.round) ?? [];
      matches.push(match);
      grouped.set(match.round, matches);
    }
    return [...grouped.entries()].sort(([a], [b]) => a - b);
  }, [bracket]);

  if (failed) return <LoadErrorBanner onRetry={load} />;
  if (loading || !data) {
    return (
      <div className="py-8 text-center text-sm text-zinc-500">
        토너먼트를 불러오는 중...
      </div>
    );
  }

  const champion = bracket?.championUserId
    ? participantById.get(bracket.championUserId)
    : null;

  return (
    <section className="space-y-3">
      <div className={`${SURFACE_ACCENT} space-y-2 p-4`}>
        <div className="flex items-center gap-2">
          <Trophy size={20} weight="duotone" className="text-amber-600" />
          <h2 className="font-semibold">일요일 챔피언십</h2>
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          월~토 예선에서 10경기 이상 치른 상위 참가자가 8·16·32강으로
          맞붙습니다. 대진은 포트 추첨, 경기는 3판 2선승이며 토너먼트 결과는
          Elo에 영향을 주지 않습니다.
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
          <span>예선 마감 {formatKst(data.season?.rankedEndsAt)}</span>
          <span>시즌 정산 {formatKst(data.season?.endAt)}</span>
        </div>
      </div>

      {data.phase === "ranked" && !tournament?.isCurrent && (
        <div className={`${SURFACE_CARD} p-4 text-sm`}>
          토요일 23:59까지 예선 순위를 올려 주세요. 일요일 00:00에 전투
          템플릿과 순위를 동결해 대진을 확정합니다.
        </div>
      )}

      {bracket?.status === "not_enough_players" && tournament?.isCurrent && (
        <div className={`${SURFACE_CARD} p-4 text-sm`}>
          이번 주에는 10경기를 채운 참가자가 8명보다 적어 본선이 열리지
          않았습니다. 주간 순위 보상은 기존대로 지급됩니다.
        </div>
      )}

      {champion && (
        <div className={`${SURFACE_CARD} flex items-center gap-3 p-4`}>
          <Crown size={28} weight="fill" className="text-amber-500" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-amber-700 dark:text-amber-300">
              {tournament?.isCurrent ? "이번 주 챔피언" : "최근 챔피언"}
            </div>
            <div className="truncate text-lg font-bold">{champion.name}</div>
            <div className="text-xs text-zinc-500">
              예선 {champion.qualifyingRank}위 · {champion.rating}점
            </div>
          </div>
          <div className="text-right text-xs text-zinc-500">
            {bracket?.bracketSize}강
            <br />
            {tournament?.seasonId}
          </div>
        </div>
      )}

      {tournament?.myReward && (
        <div className={`${SURFACE_INSET} flex items-center justify-between p-3 text-sm`}>
          <span>
            내 결과 · <strong>{tournament.myReward.placement}</strong>
          </span>
          <span className="font-semibold text-amber-700 dark:text-amber-300">
            {tournament.myReward.coins.toLocaleString("ko-KR")} 코인
          </span>
        </div>
      )}

      {rounds.map(([round, matches]) => (
        <section key={round} className={`${SURFACE_CARD} space-y-2 p-4`}>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              {matches[0]?.roundName ?? `${round}라운드`}
            </h3>
            <span className="text-xs text-zinc-500">{matches.length}경기</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {matches.map((match) => {
              const p1 = participantById.get(match.p1UserId);
              const p2 = participantById.get(match.p2UserId);
              return (
                <div key={match.id} className={`${SURFACE_INSET} space-y-1.5 p-3 text-sm`}>
                  {[
                    { participant: p1, wins: match.p1Wins },
                    { participant: p2, wins: match.p2Wins },
                  ].map(({ participant, wins }) => {
                    const won = participant?.userId === match.winnerUserId;
                    return (
                      <div
                        key={participant?.userId ?? `missing-${wins}`}
                        className="flex items-center gap-2"
                      >
                        <span className="w-5 text-xs tabular-nums text-zinc-400">
                          {participant?.qualifyingRank ?? "-"}
                        </span>
                        <span
                          className={`min-w-0 flex-1 truncate ${
                            won ? "font-semibold text-emerald-700 dark:text-emerald-300" : ""
                          }`}
                        >
                          {participant?.name ?? "참가자"}
                        </span>
                        <span className="font-bold tabular-nums">{wins}</span>
                      </div>
                    );
                  })}
                  <div className="border-t border-zinc-200 pt-1 text-[11px] text-zinc-500 dark:border-zinc-700">
                    {match.games.length}경기 ·
                    {match.decidedBy === "hp"
                      ? " 잔여 HP 판정"
                      : match.decidedBy === "seed"
                        ? " 예선 순위 판정"
                        : " 다승 판정"}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </section>
  );
}
