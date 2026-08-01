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
import { useGameState } from "@/adventure/v2/GameStateProvider";
import type { ArenaTournamentBracket } from "@/lib/server/pvp/arenaTournament";
import { arenaChampionshipBadgeForPlacement } from "@/adventure/data/v2/arenaChampionshipBadges";
import { ArenaChampionshipBadge } from "@/components/chat/ChatCosmetics";
import { arenaTournamentReplayHref } from "@/lib/chat-config";

type TournamentBetting = {
  pools: Array<{
    matchId: string;
    total: number;
    choices: Record<string, number>;
  }>;
  myBets: Array<{
    matchId: string;
    chosenUserId: string;
    amount: number;
    status: string;
    payout: number;
  }>;
  limits: {
    minimum: number;
    maximum: number;
    seasonMaximum: number;
    closeBeforeSeconds: number;
    feePercent: number;
  };
};

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
    betting: TournamentBetting;
  } | null;
};

const BET_ERROR: Record<string, string> = {
  not_open: "챔피언십 기간이 아닙니다.",
  tournament_missing: "대진표가 아직 준비되지 않았습니다.",
  match_missing: "경기를 찾을 수 없습니다.",
  match_not_ready: "진출자가 아직 확정되지 않았습니다.",
  betting_closed: "이 경기의 베팅이 마감됐습니다.",
  invalid_choice: "베팅할 선수를 다시 선택해 주세요.",
  own_match: "본인 경기에는 베팅할 수 없습니다.",
  invalid_amount: "허용된 베팅 금액을 확인해 주세요.",
  already_bet: "이 경기에는 이미 베팅했습니다.",
  season_limit: "이번 챔피언십 베팅 한도에 도달했습니다.",
  insufficient_gold: "보유 골드가 부족합니다.",
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

function betStatus(status: string): string {
  if (status === "won") return "적중";
  if (status === "lost") return "미적중";
  if (status === "refunded") return "환불";
  return "결과 대기";
}

export function V2ArenaTournamentTab() {
  const { viewerUserId, setGold, setBankedGold } = useGameState();
  const [data, setData] = useState<TournamentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [bettingMatchId, setBettingMatchId] = useState<string | null>(null);
  const [betMessage, setBetMessage] = useState<Record<string, string>>({});

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
  const poolByMatch = useMemo(
    () =>
      new Map(
        (tournament?.betting.pools ?? []).map((pool) => [pool.matchId, pool]),
      ),
    [tournament?.betting.pools],
  );
  const myBetByMatch = useMemo(
    () =>
      new Map(
        (tournament?.betting.myBets ?? []).map((bet) => [bet.matchId, bet]),
      ),
    [tournament?.betting.myBets],
  );
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

  const placeBet = useCallback(
    async (matchId: string) => {
      const chosenUserId = choices[matchId];
      const amount = Number(amounts[matchId] ?? 1_000);
      if (!chosenUserId) {
        setBetMessage((current) => ({
          ...current,
          [matchId]: "선수를 먼저 선택해 주세요.",
        }));
        return;
      }
      setBettingMatchId(matchId);
      setBetMessage((current) => ({ ...current, [matchId]: "" }));
      try {
        const response = await fetch("/api/v2/arena/tournament/bet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matchId, chosenUserId, amount }),
        });
        const json = (await response.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          gold?: number;
          bankedGold?: number;
        } | null;
        if (!response.ok || !json?.ok) {
          setBetMessage((current) => ({
            ...current,
            [matchId]: BET_ERROR[json?.error ?? ""] ?? "베팅하지 못했습니다.",
          }));
          return;
        }
        if (typeof json.gold === "number") setGold(json.gold);
        if (typeof json.bankedGold === "number") {
          setBankedGold(json.bankedGold);
        }
        setBetMessage((current) => ({
          ...current,
          [matchId]: `${amount.toLocaleString("ko-KR")} 골드 베팅 완료`,
        }));
        await load(false);
      } catch {
        setBetMessage((current) => ({
          ...current,
          [matchId]: "네트워크 오류로 베팅하지 못했습니다.",
        }));
      } finally {
        setBettingMatchId(null);
      }
    },
    [amounts, choices, load, setBankedGold, setGold],
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
          일요일 19:00에 같은 라운드 경기를 일괄 진행하고 15분마다 다음
          라운드로 넘어갑니다. 20:00에 3·4위전, 20:15에 결승을 진행하며
          다른 모험가는 골드 풀 베팅에 참여할 수 있습니다.
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
          확정되지만, 아레나 전투 세팅은 18:00 전까지 다시 저장할 수 있습니다.
          경기는 19:00부터 시작합니다.
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
              <ArenaChampionshipBadge badge="gold" />
              {champion.name}
            </div>
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

      {tournament?.betting && (
        <div className={`${SURFACE_INSET} p-3 text-xs text-zinc-600 dark:text-zinc-300`}>
          경기당 {tournament.betting.limits.minimum.toLocaleString("ko-KR")}~
          {tournament.betting.limits.maximum.toLocaleString("ko-KR")} 골드 · 일요일
          합계 {tournament.betting.limits.seasonMaximum.toLocaleString("ko-KR")} 골드 ·
          경기 {tournament.betting.limits.closeBeforeSeconds}초 전 마감 · 패배 풀 수수료{" "}
          {tournament.betting.limits.feePercent}%
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
              const pool = poolByMatch.get(match.id);
              const myBet = myBetByMatch.get(match.id);
              const ownMatch = [match.p1UserId, match.p2UserId].includes(
                viewerUserId,
              );
              const bettingClosed =
                match.status === "completed" ||
                nowMs >=
                  new Date(match.scheduledAt).getTime() -
                    (tournament?.betting.limits.closeBeforeSeconds ?? 30) * 1_000;
              const canBet =
                tournament?.isCurrent &&
                p1 &&
                p2 &&
                !ownMatch &&
                !myBet &&
                !bettingClosed;
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
                    const selected = participant?.userId === choices[match.id];
                    return (
                      <button
                        type="button"
                        key={participant?.userId ?? `${match.id}-waiting-${index}`}
                        disabled={!canBet || !participant}
                        onClick={() =>
                          participant &&
                          setChoices((current) => ({
                            ...current,
                            [match.id]: participant.userId,
                          }))
                        }
                        className={`flex w-full items-center gap-2 rounded px-1 py-1 text-left ${
                          selected ? "bg-amber-100 dark:bg-amber-950" : ""
                        }`}
                      >
                        <span className="w-5 text-xs tabular-nums text-zinc-400">
                          {participant?.qualifyingRank ?? "-"}
                        </span>
                        <span
                          className={`min-w-0 flex-1 truncate ${
                            won ? "font-semibold text-emerald-700 dark:text-emerald-300" : ""
                          }`}
                        >
                          {participant && (
                            <ArenaChampionshipBadge
                              badge={badgeByUser.get(participant.userId)}
                            />
                          )}
                          {participant?.name ?? "진출자 확정 대기"}
                        </span>
                        {participant && (
                          <span className="text-[10px] text-zinc-500">
                            {(pool?.choices[participant.userId] ?? 0).toLocaleString("ko-KR")}
                          </span>
                        )}
                        <span className="font-bold tabular-nums">{wins}</span>
                      </button>
                    );
                  })}

                  {canBet && (
                    <div className="flex gap-1.5 border-t border-zinc-200 pt-2 dark:border-zinc-700">
                      <input
                        type="number"
                        min={tournament.betting.limits.minimum}
                        max={tournament.betting.limits.maximum}
                        step={100}
                        value={amounts[match.id] ?? "1000"}
                        onChange={(event) =>
                          setAmounts((current) => ({
                            ...current,
                            [match.id]: event.target.value,
                          }))
                        }
                        className="min-w-0 flex-1 rounded border border-zinc-300 bg-white px-2 py-1.5 text-xs dark:border-zinc-600 dark:bg-zinc-900"
                        aria-label={`${match.roundName} ${match.slot}경기 베팅 골드`}
                      />
                      <button
                        type="button"
                        disabled={!choices[match.id] || bettingMatchId === match.id}
                        onClick={() => placeBet(match.id)}
                        className="rounded bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white disabled:bg-zinc-400"
                      >
                        {bettingMatchId === match.id ? "처리 중" : "베팅"}
                      </button>
                    </div>
                  )}

                  {myBet && (
                    <div className="border-t border-zinc-200 pt-1 text-[11px] text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
                      내 베팅 · {participantById.get(myBet.chosenUserId)?.name ?? "참가자"}
                      {" "}{myBet.amount.toLocaleString("ko-KR")} 골드 · {betStatus(myBet.status)}
                      {myBet.payout > 0
                        ? ` · ${myBet.payout.toLocaleString("ko-KR")} 골드 지급`
                        : ""}
                    </div>
                  )}
                  {ownMatch && match.status === "scheduled" && (
                    <div className="text-[11px] text-zinc-500">
                      본인 경기에는 베팅할 수 없습니다.
                    </div>
                  )}
                  {betMessage[match.id] && (
                    <div className="text-[11px] text-amber-700 dark:text-amber-300">
                      {betMessage[match.id]}
                    </div>
                  )}
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
