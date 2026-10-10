"use client";

import {
  GUILD_EXPLORATION_EXPEDITION_IDS,
  GUILD_EXPLORATION_EXPEDITIONS,
  guildExplorationDurationMinutes,
  type GuildExplorationActiveExpedition,
  type GuildExplorationExpeditionId,
} from "@/adventure/data/v2/guildExploration";
import {
  formatGuildExplorationDuration,
  guildExplorationExpeditionScheduleText,
} from "./guildExplorationSchedule";

// 원정대 파견 현황. 진행 중 원정은 원정마다 회수 버튼을 두고, 동시 파견 한도가 남아
// 있으면 아직 보내지 않은 원정 목록을 함께 보여준다.
export function GuildExpeditionBoard({
  level,
  concurrentLimit,
  active,
  nowMs,
  canManage,
  acting,
  confirmingExpeditionId,
  onConfirm,
  onCancel,
  onDispatch,
  onClaim,
}: {
  level: number;
  concurrentLimit: number;
  active: GuildExplorationActiveExpedition[];
  nowMs: number;
  canManage?: boolean;
  acting: string | null;
  confirmingExpeditionId: GuildExplorationExpeditionId | null;
  onConfirm: (id: GuildExplorationExpeditionId | null) => void;
  onCancel: () => void;
  onDispatch: (id: GuildExplorationExpeditionId) => void;
  onClaim: (id: GuildExplorationExpeditionId) => void;
}) {
  const activeIds = new Set(active.map((item) => item.expeditionId));
  const canDispatchMore = active.length < concurrentLimit;

  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">
          원정대 파견
        </div>
        {active.length > 0 ? (
          <span className="rounded bg-cyan-100 px-2 py-1 text-[11px] font-semibold text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300">
            진행 중 {active.length}/{concurrentLimit}
          </span>
        ) : null}
      </div>

      {active.map((item) => {
        const def = GUILD_EXPLORATION_EXPEDITIONS[item.expeditionId];
        const done = nowMs > 0 && new Date(item.endsAt).getTime() <= nowMs;
        const busy = acting === `claim_expedition:${item.expeditionId}`;
        const durationMinutes = Math.max(
          0,
          Math.round(
            (new Date(item.endsAt).getTime() -
              new Date(item.startedAt).getTime()) /
              60_000,
          ),
        );
        return (
          <div
            key={item.expeditionId}
            className="mt-2 rounded border border-cyan-200 bg-white px-3 py-2 dark:border-cyan-900 dark:bg-zinc-950"
          >
            <div className="font-semibold text-cyan-900 dark:text-cyan-100">
              {def.name}
            </div>
            <div className="mt-1 text-xs leading-relaxed text-cyan-700 dark:text-cyan-200">
              {guildExplorationExpeditionScheduleText(item, durationMinutes)}
            </div>
            <button
              type="button"
              aria-label={`${def.name} 보상 회수`}
              disabled={!done || acting != null}
              onClick={() => onClaim(item.expeditionId)}
              className="mt-2 w-full rounded-md border border-cyan-700 bg-cyan-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "회수 중" : done ? "원정 보상 회수" : "원정 진행 중"}
            </button>
          </div>
        );
      })}

      {canDispatchMore ? (
        <div className="mt-2 grid gap-2">
          {GUILD_EXPLORATION_EXPEDITION_IDS.filter((id) => !activeIds.has(id)).map(
            (id) => {
              const expedition = GUILD_EXPLORATION_EXPEDITIONS[id];
              const locked = level < expedition.minLevel;
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
                      {formatGuildExplorationDuration(
                        guildExplorationDurationMinutes(expedition, level),
                      )}
                    </span>
                  </div>
                  <div className="mt-2 flex items-end justify-between gap-2">
                    <span className="min-w-0 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                      <span className="block">
                        파견 비용 {expedition.costGold.toLocaleString()}G
                      </span>
                      <span className="block">
                        귀환 금고 +{expedition.rewardGold.toLocaleString()}G ·
                        명성 +{expedition.rewardFame.toLocaleString()} · 지도
                        조각 +{expedition.mapFragments.toLocaleString()}
                      </span>
                      {expedition.memberRewardName ? (
                        <span className="block">
                          길드원 전원 {expedition.memberRewardName}
                        </span>
                      ) : null}
                    </span>
                    {confirmingExpeditionId === id ? (
                      <div className="flex shrink-0 flex-col gap-1">
                        <button
                          type="button"
                          disabled={acting != null}
                          onClick={() => onDispatch(id)}
                          className="rounded-md border border-amber-700 bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {acting === `dispatch:${id}`
                            ? "파견 중"
                            : `${expedition.costGold.toLocaleString()}G 사용`}
                        </button>
                        <button
                          type="button"
                          disabled={acting != null}
                          onClick={onCancel}
                          className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        aria-label={`${expedition.name} 파견`}
                        disabled={!canManage || locked || acting != null}
                        onClick={() => onConfirm(id)}
                        className="shrink-0 rounded-md border border-cyan-700 bg-cyan-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {locked ? `Lv.${expedition.minLevel} 해금` : "파견"}
                      </button>
                    )}
                  </div>
                </div>
              );
            },
          )}
        </div>
      ) : null}
    </div>
  );
}
