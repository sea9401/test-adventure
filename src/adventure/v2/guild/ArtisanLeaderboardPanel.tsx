"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { PlayerNameLink } from "@/components/ui/PlayerNameLink";

type ArtisanLeaderboardEntry = {
  userId: string;
  rank: number;
  name: string;
  guild: { id: number; name: string } | null;
  level: number;
  xp: number;
  xpIntoLevel: number;
  xpForNext: number;
  totalCrafts: number;
  qualityCrafts: number;
  weeklyXp: number;
  cumulativeCrafts: number;
  isMe: boolean;
};

type ArtisanLeaderboardReward = {
  rank: number;
  titleId: string;
  titleName: string;
  label: string;
  rewardFame: number;
  eligible: boolean;
  owned: boolean;
  seasonRewardClaimed: boolean;
  claimable: boolean;
};

type ArtisanLeaderboardNextReward = {
  rank: number;
  titleId: string;
  label: string;
  rewardFame: number;
  ranksToGo: number;
};

type ArtisanLeaderboardSeason = {
  key: string;
  label: string;
  endsAt: string;
  basis: string;
};

type ArtisanPreviousSeason = {
  weekKey: string;
  rank: number;
  totalCrafts: number;
  qualityCrafts: number;
  weeklyXp: number;
  rewardClaimedAt: string | null;
};

type ArtisanLeaderboardData = {
  profession: "blacksmith";
  season: ArtisanLeaderboardSeason | null;
  previousSeason: ArtisanPreviousSeason | null;
  totalRanked: number;
  myRank: number | null;
  rewards: ArtisanLeaderboardReward[];
  nextReward: ArtisanLeaderboardNextReward | null;
  entries: ArtisanLeaderboardEntry[];
};

function rankLabel(rank: number): string {
  return rank <= 3 ? `${rank}위` : `${rank}위`;
}

export function ArtisanLeaderboardPanel({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<ArtisanLeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rewardMessage, setRewardMessage] = useState<string | null>(null);

  const load = useCallback((alive: () => boolean) => {
    setLoading(true);
    setError(null);
    fetch("/api/v2/artisan/leaderboard")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!alive()) return;
        if (json?.ok && Array.isArray(json.entries)) {
          setData({
            profession: "blacksmith",
            season:
              json.season && typeof json.season === "object"
                ? (json.season as ArtisanLeaderboardSeason)
                : null,
            previousSeason:
              json.previousSeason && typeof json.previousSeason === "object"
                ? (json.previousSeason as ArtisanPreviousSeason)
                : null,
            totalRanked:
              typeof json.totalRanked === "number" ? json.totalRanked : 0,
            myRank: typeof json.myRank === "number" ? json.myRank : null,
            rewards: Array.isArray(json.rewards) ? json.rewards : [],
            nextReward:
              json.nextReward && typeof json.nextReward === "object"
                ? (json.nextReward as ArtisanLeaderboardNextReward)
                : null,
            entries: json.entries as ArtisanLeaderboardEntry[],
          });
        } else {
          setError("장인 랭킹을 불러오지 못했습니다.");
        }
      })
      .catch(() => {
        if (alive()) setError("장인 랭킹을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (alive()) setLoading(false);
      });
  }, []);

  useEffect(() => {
    let alive = true;
    queueMicrotask(() => {
      if (alive) void load(() => alive);
    });
    return () => {
      alive = false;
    };
  }, [load]);

  async function claimRewards() {
    setClaiming(true);
    setRewardMessage(null);
    try {
      const res = await fetch("/api/v2/artisan/leaderboard", {
        method: "POST",
      });
      const json = await res.json();
      if (!json.ok) {
        setRewardMessage(
          json.error === "not_ranked"
            ? "제작 기록이 있어야 랭킹 보상을 받을 수 있습니다."
            : "현재 순위에서 받을 수 있는 보상이 없습니다.",
        );
        return;
      }
      if (Array.isArray(json.rewards)) {
        setData((prev) =>
          prev
            ? {
                ...prev,
                rewards: json.rewards,
                nextReward:
                  json.nextReward && typeof json.nextReward === "object"
                    ? (json.nextReward as ArtisanLeaderboardNextReward)
                    : null,
              }
            : prev,
        );
      }
      const rewards = Array.isArray(json.rewards)
        ? (json.rewards as ArtisanLeaderboardReward[])
        : (data?.rewards ?? []);
      const grantedNames = Array.isArray(json.grantedTitles)
        ? json.grantedTitles
            .map((id: unknown) => {
              const reward = rewards.find((r) => r.titleId === id);
              return reward?.titleName;
            })
            .filter((name: unknown): name is string => typeof name === "string")
        : [];
      setRewardMessage(
        grantedNames.length > 0
          ? `칭호 획득: ${grantedNames.join(", ")} · 길드 명성 +${Number(
              json.rewardFame ?? 0,
            ).toLocaleString()}`
          : "이미 받을 수 있는 랭킹 보상을 모두 수령했습니다.",
      );
    } catch {
      setRewardMessage("랭킹 보상 수령에 실패했습니다.");
    } finally {
      setClaiming(false);
    }
  }

  const hasEligibleReward =
    data?.rewards.some((reward) => reward.claimable) ?? false;
  const myEntry = data?.entries.find((entry) => entry.isMe) ?? null;

  return (
    <section className="space-y-3 rounded-md border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
            전체 장인 랭킹
          </h3>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            제작 횟수 기준. 동률은 품질 제작, 숙련도 순입니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="shrink-0 rounded border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          제작
        </button>
      </div>

      {data ? (
        <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
          <div className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-zinc-500 dark:text-zinc-400">참여 장인</div>
            <div className="mt-1 font-semibold tabular-nums">
              {data.totalRanked.toLocaleString()}명
            </div>
          </div>
          <div className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-zinc-500 dark:text-zinc-400">내 순위</div>
            <div className="mt-1 font-semibold tabular-nums">
              {data.myRank ? `${data.myRank.toLocaleString()}위` : "기록 없음"}
            </div>
          </div>
          <div className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-zinc-500 dark:text-zinc-400">이번 주 제작</div>
            <div className="mt-1 font-semibold tabular-nums">
              {myEntry
                ? `${myEntry.totalCrafts.toLocaleString()}회`
                : "기록 없음"}
            </div>
          </div>
          <div className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-zinc-500 dark:text-zinc-400">이번 주 XP</div>
            <div className="mt-1 font-semibold tabular-nums">
              {myEntry ? myEntry.weeklyXp.toLocaleString() : "0"}
            </div>
          </div>
        </div>
      ) : null}

      {data?.season ? (
        <div className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          <div className="font-semibold text-zinc-800 dark:text-zinc-100">
            {data.season.label}
          </div>
          <div className="mt-1">
            종료 {new Date(data.season.endsAt).toLocaleString()} ·{" "}
            {data.season.basis}
          </div>
        </div>
      ) : null}

      {data?.previousSeason ? (
        <div className="rounded border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100">
          <div className="font-semibold">지난 확정 시즌</div>
          <div className="mt-1">
            {data.previousSeason.weekKey} · {data.previousSeason.rank}위 · 제작{" "}
            {data.previousSeason.totalCrafts.toLocaleString()}회 · 품질{" "}
            {data.previousSeason.qualityCrafts.toLocaleString()}회 · XP{" "}
            {data.previousSeason.weeklyXp.toLocaleString()}
          </div>
        </div>
      ) : null}

      {data?.rewards.length ? (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-semibold">랭킹 보상</div>
              <div className="mt-1 text-amber-800/80 dark:text-amber-200/80">
                제작 기록이 있으면 시즌 참여 보상을 받을 수 있고, 상위권은
                추가 칭호와 명성을 받습니다. 순위가 오른 뒤 다시 수령하면 상위
                보상만 추가됩니다.
              </div>
              {data.nextReward ? (
                <div className="mt-1 rounded border border-amber-200 bg-white/70 px-2 py-1 text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-100">
                  다음 목표: {data.nextReward.label}까지{" "}
                  {data.nextReward.ranksToGo.toLocaleString()}위 상승 · 명성 +
                  {data.nextReward.rewardFame.toLocaleString()}
                </div>
              ) : data.myRank ? (
                <div className="mt-1 rounded border border-amber-200 bg-white/70 px-2 py-1 text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-100">
                  현재 순위에서 받을 수 있는 상위 랭킹 보상을 모두 달성했습니다.
                </div>
              ) : null}
              <div className="mt-1 flex flex-wrap gap-1">
                {data.rewards.map((reward) => (
                  <span
                    key={reward.titleId}
                    className={`rounded px-1.5 py-px font-medium ${
                      reward.owned
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300"
                        : reward.claimable
                        ? "bg-amber-200 text-amber-900 dark:bg-amber-800 dark:text-amber-50"
                        : "bg-white/70 text-amber-700 opacity-70 dark:bg-amber-950 dark:text-amber-200"
                    }`}
                  >
                    {reward.label} · {reward.titleName} · 명성 +
                    {reward.rewardFame.toLocaleString()} ·{" "}
                    {reward.owned
                      ? reward.seasonRewardClaimed
                        ? "보유/시즌 보상 완료"
                        : "보유"
                      : reward.claimable
                        ? "수령 가능"
                        : "미달성"}
                  </span>
                ))}
              </div>
              {rewardMessage ? (
                <div className="mt-1 text-amber-800 dark:text-amber-200">
                  {rewardMessage}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              disabled={!hasEligibleReward || claiming}
              onClick={() => void claimRewards()}
              className="shrink-0 rounded border border-amber-700 bg-amber-700 px-2.5 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500 dark:border-amber-500 dark:bg-amber-600 dark:disabled:border-zinc-700 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
            >
              {claiming ? "처리 중" : "수령"}
            </button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
          불러오는 중…
        </div>
      ) : error ? (
        <div className="py-8 text-center text-sm text-rose-600 dark:text-rose-400">
          {error}
        </div>
      ) : !data || data.entries.length === 0 ? (
        <Card padding="md">
          <div className="text-sm text-zinc-500 dark:text-zinc-400">
            아직 제작 기록이 없습니다.
          </div>
        </Card>
      ) : (
        <div className="divide-y divide-zinc-200 overflow-hidden rounded border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {data.entries.map((entry) => (
            <div
              key={entry.userId}
              className={`grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2.5 ${
                entry.isMe ? "bg-emerald-50 dark:bg-emerald-950/30" : ""
              }`}
            >
              <div className="text-center text-sm font-bold tabular-nums text-zinc-600 dark:text-zinc-300">
                {rankLabel(entry.rank)}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  <PlayerNameLink name={entry.name} />
                  {entry.isMe ? (
                    <span className="ml-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                      나
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {entry.guild?.name ?? "무소속"} · 대장장이 Lv{" "}
                  {entry.level.toLocaleString()} · 숙련도{" "}
                  {entry.xpIntoLevel.toLocaleString()}/
                  {entry.xpForNext.toLocaleString()}
                </div>
                <div className="mt-0.5 truncate text-[11px] text-zinc-400 dark:text-zinc-500">
                  시즌 XP {entry.weeklyXp.toLocaleString()} · 누적 제작{" "}
                  {entry.cumulativeCrafts.toLocaleString()}회
                </div>
              </div>
              <div className="text-right text-xs">
                <div className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                  {entry.totalCrafts.toLocaleString()}회
                </div>
                <div className="text-zinc-500 dark:text-zinc-400">
                  품질 {entry.qualityCrafts.toLocaleString()}회
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
