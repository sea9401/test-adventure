"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Barbell,
  CheckCircle,
  LockKey,
  SpinnerGap,
} from "@phosphor-icons/react";
import { SETTLEMENT_BUILDINGS } from "@/adventure/data/v2/settlement";
import type { GuildTrainingDrillId } from "@/adventure/data/v2/guildTrainingGround";
import { useRewardToast } from "@/adventure/v2/RewardToastProvider";
import type { GuildInfoResponse } from "./guildShared";

type TrainingDrillView = {
  id: GuildTrainingDrillId;
  title: string;
  desc: string;
  focus: string;
  category: string;
  focusLabel: string;
  categoryLabel: string;
  minBuildingLevel: number;
  minCharacterLevel: number;
  claimed: boolean;
  available: boolean;
  lockedReason: string | null;
  rewardMastery: number;
  rewardGold: number;
};

type TrainingState = {
  ok?: boolean;
  dayKey?: string;
  hasTrainingGround?: boolean;
  trainingGroundLevel?: number;
  upgrade?: {
    label: string;
    trainingRewardBonusPct: number;
    unlockedDrillCount: number;
  };
  currentJob?: { id: string; name: string; mastery: number | null } | null;
  drills?: TrainingDrillView[];
};

const ERROR_TEXT: Record<string, string> = {
  unauthorized: "로그인이 필요해요.",
  no_guild: "길드 가입 후 이용할 수 있어요.",
  no_character: "캐릭터 생성 후 이용할 수 있어요.",
  training_ground_required: "길드 영지에 훈련장이 필요해요.",
  already_claimed: "오늘 이미 완료한 훈련이에요.",
  locked: "아직 이용할 수 없는 훈련이에요.",
  invalid: "잘못된 요청이에요.",
  invalid_json: "잘못된 요청이에요.",
};

export function GuildTrainingGroundPanel({
  info,
  localTrainingGround = false,
  onChanged,
}: {
  info: GuildInfoResponse | null;
  localTrainingGround?: boolean;
  onChanged?: () => void | Promise<void>;
}) {
  const { notifyReward } = useRewardToast();
  const training = SETTLEMENT_BUILDINGS.training_ground;
  const trainingCount = info?.settlementBuildings?.training_ground ?? 0;
  const shouldShow =
    localTrainingGround || trainingCount > 0 || info?.ok === undefined;
  const [state, setState] = useState<TrainingState | null>(null);
  const [loading, setLoading] = useState(false);
  const [claimingId, setClaimingId] = useState<GuildTrainingDrillId | null>(
    null,
  );
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (alive: () => boolean = () => true) => {
    setLoading(true);
    try {
      const res = await fetch("/api/v2/guild/training-ground");
      const json = (await res.json().catch(() => null)) as TrainingState | null;
      if (!alive()) return;
      if (!res.ok || !json?.ok) {
        const err = (json as { error?: string } | null)?.error ?? "load_failed";
        setMessage(ERROR_TEXT[err] ?? "훈련장 정보를 불러오지 못했어요.");
        setState(json);
      } else {
        setMessage(null);
        setState(json);
      }
    } catch {
      if (alive()) {
        setMessage("네트워크 오류로 훈련장 정보를 불러오지 못했어요.");
      }
    } finally {
      if (alive()) setLoading(false);
    }
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

  const claim = async (drillId: GuildTrainingDrillId) => {
    setClaimingId(drillId);
    setMessage(null);
    try {
      const res = await fetch("/api/v2/guild/training-ground", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ drillId }),
      });
      const json = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            reason?: string | null;
            rewardMastery?: number;
            rewardGold?: number;
            masteryAfter?: number;
          }
        | null;
      if (!res.ok || !json?.ok) {
        const err = json?.error ?? "claim_failed";
        setMessage(json?.reason ?? ERROR_TEXT[err] ?? "훈련을 완료하지 못했어요.");
        return;
      }
      const text = `숙련도 +${(json.rewardMastery ?? 0).toLocaleString()} · 골드 +${(
        json.rewardGold ?? 0
      ).toLocaleString()}`;
      setMessage(text);
      notifyReward("훈련 완료", text);
      await load();
      await onChanged?.();
    } catch {
      setMessage("네트워크 오류로 훈련을 완료하지 못했어요.");
    } finally {
      setClaimingId(null);
    }
  };

  if (!shouldShow) return null;

  const level = state?.trainingGroundLevel ?? 0;
  const hasTrainingGround =
    localTrainingGround || state?.hasTrainingGround === true || level > 0;
  const drills = state?.drills ?? [];
  const dailyClaimLimit = Math.max(1, state?.upgrade?.unlockedDrillCount ?? 1);
  const completedCount = drills.filter((drill) => drill.claimed).length;
  const availableCount = drills.filter((drill) => drill.available).length;
  const progressPct = Math.min(
    100,
    Math.max(0, (completedCount / dailyClaimLimit) * 100),
  );

  return (
    <section className="space-y-3 rounded-md border border-sky-200 bg-white p-3 text-sm text-zinc-900 shadow-sm dark:border-sky-900/60 dark:bg-slate-950 dark:text-zinc-100">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg leading-none">{training.icon}</span>
            <h3 className="text-sm font-semibold">{training.name}</h3>
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {hasTrainingGround
              ? `Lv ${level} · ${state?.upgrade?.label ?? "훈련 설비"}`
              : "길드 영지 슬롯에 훈련장을 배치하면 이용할 수 있어요."}
          </p>
        </div>
        {hasTrainingGround && (
          <div className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-right text-[11px] text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-300">
            <div>보상 +{state?.upgrade?.trainingRewardBonusPct ?? 0}%</div>
            <div>일일 {dailyClaimLimit}회</div>
          </div>
        )}
      </div>

      {hasTrainingGround && (
        <div className="grid gap-2 rounded-md border border-sky-100 bg-sky-50/70 p-3 text-xs dark:border-sky-900/50 dark:bg-slate-900">
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded border border-white/70 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-950">
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                현재 직업
              </div>
              <div className="mt-0.5 truncate font-semibold">
                {state?.currentJob?.name ?? "전직 필요"}
              </div>
            </div>
            <div className="rounded border border-white/70 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-950">
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                현재 숙련도
              </div>
              <div className="mt-0.5 font-semibold tabular-nums">
                {(state?.currentJob?.mastery ?? 0).toLocaleString()}
              </div>
            </div>
            <div className="rounded border border-white/70 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-950">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  오늘 훈련
                </span>
                <span className="font-semibold tabular-nums">
                  {completedCount}/{dailyClaimLimit}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded bg-zinc-200 dark:bg-slate-800">
                <div
                  className="h-full rounded bg-sky-600 dark:bg-sky-400"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
            <span>
              가능 {availableCount.toLocaleString()}개 · 전체{" "}
              {drills.length.toLocaleString()}개
            </span>
            <span>{state?.upgrade?.label ?? "훈련 설비"}</span>
          </div>
        </div>
      )}

      {message && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          {message}
        </div>
      )}

      {loading && !state ? (
        <div className="flex items-center justify-center gap-2 rounded-md border border-zinc-200 px-3 py-6 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          <SpinnerGap className="animate-spin" size={16} />
          불러오는 중
        </div>
      ) : hasTrainingGround ? (
        <div className="space-y-2">
          {drills.map((drill) => {
            const busy = claimingId === drill.id;
            return (
              <div
                key={drill.id}
                className={`rounded-md border p-3 text-xs transition ${
                  drill.claimed
                    ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/20"
                    : drill.available
                      ? "border-sky-200 bg-white dark:border-sky-900/60 dark:bg-slate-900"
                      : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-slate-900/70"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {drill.title}
                      </span>
                      <span className="rounded bg-zinc-200 px-1.5 py-px text-[10px] font-medium text-zinc-600 dark:bg-slate-800 dark:text-zinc-300">
                        {drill.categoryLabel}
                      </span>
                      <span
                        className={`rounded px-1.5 py-px text-[10px] font-medium ${
                          drill.focus === "common"
                            ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                            : "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300"
                        }`}
                      >
                        {drill.focusLabel}
                      </span>
                    </div>
                    <div className="mt-0.5 text-zinc-500 dark:text-zinc-400">
                      {drill.desc}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
                      <span className="rounded bg-emerald-100 px-1.5 py-px font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                        숙련도 +{drill.rewardMastery.toLocaleString()}
                      </span>
                      <span className="rounded bg-amber-100 px-1.5 py-px font-medium text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                        골드 +{drill.rewardGold.toLocaleString()}
                      </span>
                      <span className="rounded bg-zinc-100 px-1.5 py-px text-zinc-500 dark:bg-slate-800 dark:text-zinc-400">
                        훈련장 Lv {drill.minBuildingLevel}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!drill.available || busy || claimingId != null}
                    onClick={() => void claim(drill.id)}
                    className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-emerald-700 bg-emerald-700 px-2.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500 dark:disabled:border-zinc-700 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-400"
                  >
                    {busy ? (
                      <SpinnerGap className="animate-spin" size={15} />
                    ) : drill.claimed ? (
                      <CheckCircle size={15} weight="fill" />
                    ) : drill.available ? (
                      <Barbell size={15} weight="bold" />
                    ) : (
                      <LockKey size={15} weight="fill" />
                    )}
                    {drill.claimed ? "완료" : drill.available ? "훈련" : "잠김"}
                  </button>
                </div>
                {drill.lockedReason && !drill.claimed && (
                  <div className="mt-2 rounded border border-zinc-200 bg-white/70 px-2 py-1 text-[11px] text-zinc-500 dark:border-slate-700 dark:bg-slate-950/70 dark:text-zinc-400">
                    {drill.lockedReason}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
