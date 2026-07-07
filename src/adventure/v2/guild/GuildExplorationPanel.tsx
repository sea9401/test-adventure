"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle,
  Compass,
  SpinnerGap,
} from "@phosphor-icons/react";
import {
  useRewardToast,
  useSystemMessageState,
} from "@/adventure/v2/RewardToastProvider";
import { SETTLEMENT_BUILDINGS } from "@/adventure/data/v2/settlement";
import type {
  GuildExplorationWeeklyMissionId,
  GuildExplorationWeeklyState,
} from "@/adventure/data/v2/guildExploration";

type ExplorationMissionView = {
  id: GuildExplorationWeeklyMissionId;
  title: string;
  goal: number;
  rewardGold: number;
  rewardFame: number;
  progress: number;
  progressText: string;
  goalProgress: number;
  complete: boolean;
  claimed: boolean;
  canClaim: boolean;
};

type ExplorationState = {
  ok?: boolean;
  error?: string;
  weekKey?: string;
  endsAt?: string;
  explorationHqLevel?: number;
  weeklyMissionCount?: number;
  progressBonusPct?: number;
  state?: GuildExplorationWeeklyState;
  missions?: ExplorationMissionView[];
  rewardGold?: number;
  rewardFame?: number;
};

const ERROR_TEXT: Record<string, string> = {
  unauthorized: "로그인이 필요해요.",
  no_guild: "길드 가입 후 이용할 수 있어요.",
  exploration_hq_required: "길드 시설에 탐사 본부가 필요해요.",
  invalid_mission: "탐사 의뢰 정보를 확인할 수 없어요.",
  already_claimed: "이미 수령한 탐사 의뢰입니다.",
  not_complete: "아직 완료되지 않은 탐사 의뢰입니다.",
};

export function GuildExplorationPanel({
  onChanged,
}: {
  onChanged?: () => void;
}) {
  const [state, setState] = useState<ExplorationState | null>(null);
  const [loading, setLoading] = useState(false);
  const [claimingId, setClaimingId] =
    useState<GuildExplorationWeeklyMissionId | null>(null);
  const [message, setMessage] = useSystemMessageState();
  const { notifyReward } = useRewardToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v2/guild/exploration/weekly");
      const json = (await res.json().catch(() => null)) as ExplorationState | null;
      if (!res.ok || !json?.ok) {
        setMessage(ERROR_TEXT[json?.error ?? ""] ?? "탐사 의뢰를 불러오지 못했습니다.");
        setState(json);
        return;
      }
      setState(json);
    } catch {
      setMessage("탐사 의뢰를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [setMessage]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  async function claimMission(missionId: GuildExplorationWeeklyMissionId) {
    if (claimingId) return;
    setClaimingId(missionId);
    try {
      const res = await fetch("/api/v2/guild/exploration/weekly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ missionId }),
      });
      const json = (await res.json().catch(() => null)) as ExplorationState | null;
      if (!res.ok || !json?.ok) {
        setMessage(ERROR_TEXT[json?.error ?? ""] ?? "탐사 의뢰 보상 수령에 실패했습니다.");
        if (json?.missions) {
          setState((prev) => ({ ...(prev ?? {}), ...json }));
        }
        return;
      }
      setState(json);
      const rewardText = [
        json.rewardGold ? `길드 금고 +${json.rewardGold.toLocaleString()}G` : null,
        json.rewardFame ? `명성 +${json.rewardFame.toLocaleString()}` : null,
      ].filter(Boolean).join(" · ");
      notifyReward("탐사 의뢰 보상", rewardText || "보상 수령 완료");
      onChanged?.();
    } catch {
      setMessage("탐사 의뢰 보상 수령에 실패했습니다.");
    } finally {
      setClaimingId(null);
    }
  }

  const missions = state?.missions ?? [];
  const endsAt = state?.endsAt ? new Date(state.endsAt) : null;

  return (
    <section className="rounded-md border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span aria-hidden>{SETTLEMENT_BUILDINGS.exploration_hq.icon}</span>
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
              {SETTLEMENT_BUILDINGS.exploration_hq.name}
            </h3>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            길드 단위 주간 탐사 의뢰의 슬롯과 진척 보너스를 관리합니다.
          </p>
        </div>
        <span className="rounded bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
          Lv.{state?.explorationHqLevel ?? 1}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded bg-zinc-50 px-3 py-2 dark:bg-zinc-900">
          <dt className="text-xs text-zinc-500 dark:text-zinc-400">
            주간 탐사
          </dt>
          <dd className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">
            {state?.ok
              ? `${missions.length}/${state.weeklyMissionCount ?? 1}`
              : "1"}
            건
          </dd>
        </div>
        <div className="rounded bg-zinc-50 px-3 py-2 dark:bg-zinc-900">
          <dt className="text-xs text-zinc-500 dark:text-zinc-400">
            진척 보너스
          </dt>
          <dd className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">
            +{state?.progressBonusPct ?? 0}%
          </dd>
        </div>
      </dl>

      <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            주간 탐사 의뢰
          </h4>
          {endsAt && !Number.isNaN(endsAt.getTime()) ? (
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
              {endsAt.toLocaleDateString("ko-KR", {
                month: "2-digit",
                day: "2-digit",
              })}{" "}
              종료
            </span>
          ) : null}
        </div>

        {message ? (
          <p className="mt-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
            {message}
          </p>
        ) : null}

        {loading && missions.length === 0 ? (
          <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <SpinnerGap size={14} className="animate-spin" />
            불러오는 중
          </div>
        ) : null}

        <div className="mt-2 space-y-2">
          {missions.map((mission) => {
            const pct =
              mission.goalProgress > 0
                ? Math.min(100, (mission.progress / mission.goalProgress) * 100)
                : 0;
            const busy = claimingId === mission.id;
            return (
              <div
                key={mission.id}
                className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-semibold text-zinc-900 dark:text-zinc-100">
                      {mission.claimed ? (
                        <CheckCircle size={16} weight="fill" className="text-emerald-500" />
                      ) : (
                        <Compass size={16} className="text-cyan-500" />
                      )}
                      <span>{mission.title}</span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      보상 길드 금고 {mission.rewardGold.toLocaleString()}G · 명성{" "}
                      {mission.rewardFame.toLocaleString()}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-zinc-600 dark:text-zinc-300">
                    {mission.progressText}/{mission.goal}
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800">
                  <div
                    className="h-full rounded bg-cyan-500 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <button
                  type="button"
                  disabled={!mission.canClaim || busy}
                  onClick={() => void claimMission(mission.id)}
                  className="mt-2 w-full rounded-md border border-cyan-700 bg-cyan-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {mission.claimed
                    ? "수령 완료"
                    : busy
                      ? "수령 중"
                      : mission.canClaim
                        ? "보상 수령"
                        : "진행 중"}
                </button>
              </div>
            );
          })}
        </div>

        {!loading && missions.length === 0 ? (
          <p className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-3 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            등록된 탐사 의뢰가 없습니다.
          </p>
        ) : null}
      </div>
    </section>
  );
}
