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
import {
  GUILD_EXPLORATION_EVENTS,
  GUILD_EXPLORATION_EXPEDITIONS,
  GUILD_EXPLORATION_EXPEDITION_IDS,
  GUILD_EXPLORATION_MAP_FRAGMENT_TARGET,
  type GuildExplorationContentState,
  type GuildExplorationEventChoiceId,
  type GuildExplorationEventDef,
  type GuildExplorationExpeditionDef,
  type GuildExplorationExpeditionId,
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
  content?: GuildExplorationContentState;
  expeditions?: Record<GuildExplorationExpeditionId, GuildExplorationExpeditionDef>;
  events?: Record<string, GuildExplorationEventDef>;
  mapFragmentTarget?: number;
  missions?: ExplorationMissionView[];
  rewardGold?: number;
  rewardFame?: number;
  mapFragments?: number;
};

const ERROR_TEXT: Record<string, string> = {
  unauthorized: "로그인이 필요해요.",
  no_guild: "길드 가입 후 이용할 수 있어요.",
  exploration_hq_required: "길드 시설에 탐사 본부가 필요해요.",
  invalid_mission: "탐사 의뢰 정보를 확인할 수 없어요.",
  invalid_expedition: "원정 정보를 확인할 수 없어요.",
  invalid_event_choice: "탐사 사건 선택지를 확인할 수 없어요.",
  already_claimed: "이미 수령한 탐사 의뢰입니다.",
  not_complete: "아직 완료되지 않은 탐사 의뢰입니다.",
  not_authorized: "길드 관리 권한이 필요해요.",
  level_required: "탐사 본부 레벨이 부족해요.",
  expedition_active: "이미 진행 중인 원정이 있어요.",
  expedition_not_ready: "아직 원정이 끝나지 않았어요.",
  insufficient_gold: "길드 금고 골드가 부족합니다.",
  map_not_ready: "지도 조각이 부족하거나 처리 중인 사건이 있어요.",
};

export function GuildExplorationPanel({
  canManage,
  onChanged,
}: {
  canManage?: boolean;
  onChanged?: () => void;
}) {
  const [state, setState] = useState<ExplorationState | null>(null);
  const [loading, setLoading] = useState(false);
  const [claimingId, setClaimingId] =
    useState<GuildExplorationWeeklyMissionId | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(0);
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

  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

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

  async function runExplorationAction(
    body: Record<string, unknown>,
    busyKey: string,
    fallbackError: string,
  ) {
    if (acting) return;
    setActing(busyKey);
    try {
      const res = await fetch("/api/v2/guild/exploration/weekly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as ExplorationState | null;
      if (!res.ok || !json?.ok) {
        setMessage(ERROR_TEXT[json?.error ?? ""] ?? fallbackError);
        if (json?.missions || json?.content) {
          setState((prev) => ({ ...(prev ?? {}), ...json }));
        }
        return;
      }
      setState(json);
      const rewardText = [
        json.rewardGold ? `길드 금고 +${json.rewardGold.toLocaleString()}G` : null,
        json.rewardFame ? `명성 +${json.rewardFame.toLocaleString()}` : null,
        json.mapFragments
          ? `지도 조각 +${json.mapFragments.toLocaleString()}`
          : null,
      ].filter(Boolean).join(" · ");
      if (rewardText) {
        notifyReward("탐사 본부", rewardText);
      }
      onChanged?.();
    } catch {
      setMessage(fallbackError);
    } finally {
      setActing(null);
    }
  }

  function dispatchExpedition(expeditionId: GuildExplorationExpeditionId) {
    return runExplorationAction(
      { action: "dispatch", expeditionId },
      `dispatch:${expeditionId}`,
      "원정대 파견에 실패했습니다.",
    );
  }

  function claimExpedition() {
    return runExplorationAction(
      { action: "claim_expedition" },
      "claim_expedition",
      "원정대 보상 회수에 실패했습니다.",
    );
  }

  function restoreMap() {
    return runExplorationAction(
      { action: "restore_map" },
      "restore_map",
      "지도 복원에 실패했습니다.",
    );
  }

  function resolveEvent(choiceId: GuildExplorationEventChoiceId) {
    return runExplorationAction(
      { action: "resolve_event", choiceId },
      `resolve:${choiceId}`,
      "탐사 사건 처리에 실패했습니다.",
    );
  }

  const missions = state?.missions ?? [];
  const endsAt = state?.endsAt ? new Date(state.endsAt) : null;
  const content = state?.content ?? state?.state?.content;
  const mapFragmentTarget =
    state?.mapFragmentTarget ?? GUILD_EXPLORATION_MAP_FRAGMENT_TARGET;
  const activeExpedition = content?.activeExpedition ?? null;
  const activeExpeditionDef = activeExpedition
    ? GUILD_EXPLORATION_EXPEDITIONS[activeExpedition.expeditionId]
    : null;
  const expeditionDone =
    activeExpedition != null &&
    nowMs > 0 &&
    new Date(activeExpedition.endsAt).getTime() <= nowMs;
  const pendingEvent = content?.pendingEvent
    ? GUILD_EXPLORATION_EVENTS[content.pendingEvent.eventId]
    : null;
  const fragmentPct = Math.min(
    100,
    ((content?.mapFragments ?? 0) / Math.max(1, mapFragmentTarget)) * 100,
  );

  return (
    <section className="rounded-md border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-700 dark:bg-zinc-900">
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

      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">
              원정대 파견
            </div>
            {activeExpeditionDef ? (
              <span className="rounded bg-cyan-100 px-2 py-1 text-[11px] font-semibold text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300">
                진행 중
              </span>
            ) : null}
          </div>
          {activeExpeditionDef && activeExpedition ? (
            <div className="mt-2 rounded border border-cyan-200 bg-white px-3 py-2 dark:border-cyan-900 dark:bg-cyan-950/30">
              <div className="font-semibold text-cyan-900 dark:text-cyan-100">
                {activeExpeditionDef.name}
              </div>
              <div className="mt-1 text-xs text-cyan-700 dark:text-cyan-200">
                완료 {formatDateTime(activeExpedition.endsAt)}
              </div>
              <button
                type="button"
                disabled={!expeditionDone || acting != null}
                onClick={() => void claimExpedition()}
                className="mt-2 w-full rounded-md border border-cyan-700 bg-cyan-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {acting === "claim_expedition"
                  ? "회수 중"
                  : expeditionDone
                    ? "원정 보상 회수"
                    : "원정 진행 중"}
              </button>
            </div>
          ) : (
            <div className="mt-2 grid gap-2">
              {GUILD_EXPLORATION_EXPEDITION_IDS.map((id) => {
                const expedition = GUILD_EXPLORATION_EXPEDITIONS[id];
                const locked =
                  (state?.explorationHqLevel ?? 0) < expedition.minLevel;
                return (
                  <div
                    key={id}
                    className="rounded border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                          {expedition.name}
                        </div>
                        <div className="mt-1 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                          {expedition.desc}
                        </div>
                      </div>
                      <span className="shrink-0 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                        {expedition.durationMinutes / 60}시간
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        비용 {expedition.costGold.toLocaleString()}G · 조각 +
                        {expedition.mapFragments}
                      </span>
                      <button
                        type="button"
                        disabled={!canManage || locked || acting != null}
                        onClick={() => void dispatchExpedition(id)}
                        className="shrink-0 rounded-md border border-cyan-700 bg-cyan-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {locked
                          ? `Lv.${expedition.minLevel}`
                          : acting === `dispatch:${id}`
                            ? "파견 중"
                            : "파견"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">
              탐사 지도
            </div>
            <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
              {(content?.mapFragments ?? 0).toLocaleString()}/
              {mapFragmentTarget.toLocaleString()}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800">
            <div
              className="h-full rounded bg-cyan-500 transition-all"
              style={{ width: `${fragmentPct}%` }}
            />
          </div>
          {pendingEvent ? (
            <div className="mt-3 rounded border border-violet-200 bg-white px-3 py-2 dark:border-violet-900 dark:bg-violet-950/30">
              <div className="font-semibold text-violet-900 dark:text-violet-100">
                {pendingEvent.title}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-violet-700 dark:text-violet-200">
                {pendingEvent.desc}
              </p>
              <div className="mt-2 grid gap-2">
                {pendingEvent.choices.map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    disabled={!canManage || acting != null}
                    onClick={() => void resolveEvent(choice.id)}
                    className="rounded-md border border-violet-700 bg-violet-700 px-3 py-1.5 text-left text-xs font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="block">{choice.label}</span>
                    <span className="mt-0.5 block font-normal opacity-80">
                      {choice.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="min-w-0 text-xs text-zinc-500 dark:text-zinc-400">
                길드 활동과 원정 보상으로 지도 조각을 모아 사건 카드를 엽니다.
              </p>
              <button
                type="button"
                disabled={
                  !canManage ||
                  acting != null ||
                  (content?.mapFragments ?? 0) < mapFragmentTarget
                }
                onClick={() => void restoreMap()}
                className="shrink-0 rounded-md border border-violet-700 bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {acting === "restore_map" ? "복원 중" : "지도 복원"}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-700">
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
                className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900"
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
          <p className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-3 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
            등록된 탐사 의뢰가 없습니다.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "확인 중";
  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
