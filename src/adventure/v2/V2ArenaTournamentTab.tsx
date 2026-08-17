"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Crown, Timer, Trophy } from "@phosphor-icons/react";
import { LoadErrorBanner } from "@/components/ui/LoadErrorBanner";
import {
  SURFACE_ACCENT,
  SURFACE_CARD,
  SURFACE_INSET,
} from "@/components/ui/surfaces";
import type { ArenaTournamentBracket } from "@/lib/server/pvp/arenaTournament";
import { arenaChampionshipBadgeForPlacement } from "@/adventure/data/v2/arenaChampionshipBadges";
import { ArenaChampionshipBadge } from "@/components/chat/ChatCosmetics";
import { arenaTournamentReplayHref } from "@/lib/chat-config";

type TournamentResponse = {
  ok?: boolean;
  phase?: "ranked" | "tournament" | "closed";
  season?: {
    id: string;
    rankedEndsAt: string;
    snapshotsAt: string;
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

function countdown(iso: string, nowMs: number): string {
  const seconds = Math.max(0, Math.ceil((new Date(iso).getTime() - nowMs) / 1000));
  if (seconds <= 0) return "진행 대기";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remain = seconds % 60;
  return hours > 0
    ? `${hours}시간 ${minutes}분`
    : `${minutes}:${String(remain).padStart(2, "0")}`;
}

export function V2ArenaTournamentTab() {
  const [data, setData] = useState<TournamentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
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
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 탭 마운트 1회 fetch
    load();
  }, [load]);

  useEffect(() => {
    const clock = window.setInterval(() => setNowMs(Date.now()), 1_000);
    const poll = window.setInterval(() => {
      if (
        data?.tournament?.isCurrent &&
        data.tournament.bracket.status !== "completed"
      ) {
        load(false);
      }
    }, 15_000);
    return () => {
      window.clearInterval(clock);
      window.clearInterval(poll);
    };
  }, [data?.tournament?.bracket.status, data?.tournament?.isCurrent, load]);

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
  const badgeByUser = useMemo(
    () =>
      new Map(
        (bracket?.rewards ?? [])
          .map((reward) => [
            reward.userId,
            arenaChampionshipBadgeForPlacement(reward.placement),
          ] as const)
          .filter((entry) => entry[1] != null),
      ),
    [bracket?.rewards],
  );

  if (failed) return <LoadErrorBanner onRetry={() => load()} />;
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
          월~토 예선 상위 참가자가 포트 추첨 후 3판 2선승으로 맞붙습니다.
          일요일 13:00에 같은 라운드 경기를 일괄 진행하고 5분마다 다음
          라운드로 넘어갑니다. 13:20에 3·4위전, 13:25에 결승을 진행합니다.
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
          <span>예선 마감 {formatKst(data.season?.rankedEndsAt)}</span>
          <span>전투 세팅 마감 {formatKst(data.season?.snapshotsAt)}</span>
          <span>경기 시작 {formatKst(bracket?.startsAt)}</span>
          <span>시즌 정산 {formatKst(data.season?.endAt)}</span>
        </div>
      </div>

      {data.phase === "ranked" && !tournament?.isCurrent && (
        <div className={`${SURFACE_CARD} p-4 text-sm`}>
          토요일 23:59까지 예선 순위를 올려 주세요. 순위와 대진은 일요일 00:00에
          확정되지만, 아레나 전투 세팅은 12:00 전까지 다시 저장할 수 있습니다.
          경기는 13:00부터 시작합니다.
        </div>
      )}

      {bracket && ["scheduled", "in_progress"].includes(bracket.status) && (
        <div className={`${SURFACE_CARD} flex items-center gap-3 p-4`}>
          <Timer size={24} weight="duotone" className="text-sky-600" />
          <div>
            <div className="text-sm font-semibold">
              {bracket.status === "scheduled" ? "챔피언십 시작까지" : "챔피언십 진행 중"}
            </div>
            <div className="text-xs text-zinc-500">
              {countdown(
                bracket.matches.find((match) => match.status === "scheduled")
                  ?.scheduledAt ?? bracket.startsAt,
                nowMs,
              )}
            </div>
          </div>
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
            <div className="flex items-center truncate text-lg font-bold">
              {champion.dishonored ? null : (
                <ArenaChampionshipBadge badge="gold" />
              )}
              {champion.dishonored
                ? "불명예 처리된 우승자"
                : champion.name}
            </div>
            {champion.dishonored ? (
              <div className="text-xs font-medium text-rose-600 dark:text-rose-300">
                운영정책 위반으로 신원이 공개되지 않습니다.
              </div>
            ) : (
              <div className="text-xs text-zinc-500">
                예선 {champion.qualifyingRank}위 · {champion.rating}점
              </div>
            )}
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
          <span className="inline-flex items-center">
            <ArenaChampionshipBadge
              badge={arenaChampionshipBadgeForPlacement(
                tournament.myReward.placement,
              )}
            />
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
              const p1 = match.p1UserId
                ? participantById.get(match.p1UserId)
                : null;
              const p2 = match.p2UserId
                ? participantById.get(match.p2UserId)
                : null;
              return (
                <div key={match.id} className={`${SURFACE_INSET} space-y-2 p-3 text-sm`}>
                  <div className="flex items-center justify-between text-[11px] text-zinc-500">
                    <span>#{match.sequence} · {formatKst(match.scheduledAt)}</span>
                    <span>
                      {match.status === "completed"
                        ? "종료"
                        : countdown(match.scheduledAt, nowMs)}
                    </span>
                  </div>
                  {[
                    { participant: p1, wins: match.p1Wins },
                    { participant: p2, wins: match.p2Wins },
                  ].map(({ participant, wins }, index) => {
                    const won = participant?.userId === match.winnerUserId;
                    return (
                      <div
                        key={participant?.userId ?? `${match.id}-waiting-${index}`}
                        className="flex w-full items-center gap-2 rounded px-1 py-1 text-left"
                      >
                        <span className="w-5 text-xs tabular-nums text-zinc-400">
                          {participant?.qualifyingRank ?? "-"}
                        </span>
                        <span
                          className={`min-w-0 flex-1 truncate ${
                            won ? "font-semibold text-emerald-700 dark:text-emerald-300" : ""
                          }`}
                        >
                          {participant && !participant.dishonored && (
                            <ArenaChampionshipBadge
                              badge={badgeByUser.get(participant.userId)}
                            />
                          )}
                          {participant?.name ?? "진출자 확정 대기"}
                        </span>
                        <span className="font-bold tabular-nums">{wins}</span>
                      </div>
                    );
                  })}
                  {match.status === "completed" && (
                    <div className="flex items-center justify-between gap-2 border-t border-zinc-200 pt-1 text-[11px] text-zinc-500 dark:border-zinc-700">
                      <span>
                        {match.games.length}경기 ·
                        {match.decidedBy === "hp"
                          ? " 잔여 HP 판정"
                          : match.decidedBy === "seed"
                            ? " 예선 순위 판정"
                            : " 다승 판정"}
                      </span>
                      {match.games.some((game) => game.hasReplay) && bracket && (
                        <Link
                          href={arenaTournamentReplayHref(
                            bracket.seasonId,
                            match.id,
                          )}
                          className="shrink-0 font-semibold text-amber-700 underline underline-offset-2 dark:text-amber-300"
                        >
                          전투 로그 보기
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </section>
  );
}
