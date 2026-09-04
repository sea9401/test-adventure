"use client";

import { useState } from "react";
import { Question } from "@phosphor-icons/react";
import {
  GUILD_CONTRIBUTION_CATEGORIES,
  GUILD_CONTRIBUTION_CATEGORY_LABEL,
} from "@/adventure/data/v2/guildContribution";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { Tooltip } from "@/components/ui/Tooltip";
import type {
  GuildContributionResponse,
  GuildInfoResponse,
} from "./guildShared";
import { GuildContributionDetailDialog } from "./GuildContributionDetailDialog";

export function GuildContributionPanel({
  data,
  info,
  loading,
}: {
  data: GuildContributionResponse | null;
  info: GuildInfoResponse | null;
  loading: boolean;
}) {
  const [selectedMember, setSelectedMember] = useState<{
    userId: string;
    name: string;
    role: string;
  } | null>(null);
  const memberByUser = new Map(
    (info?.members ?? []).map((member) => [member.userId, member]),
  );
  const canViewDetails = Boolean(info?.isMaster || info?.isManager);
  const viewer = data?.rows.find((row) => row.userId === data.viewerUserId);

  return (
    <section className={SURFACE_CARD}>
      <div className="border-b border-zinc-200 px-3 py-3 dark:border-zinc-700">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold">길드 기여도</h3>
            <Tooltip
              align="start"
              placement="bottom"
              size="wide"
              content={
                <div className="space-y-1.5">
                  <p>
                    이번 주 점수는 매주 월요일 00:00(KST)에 새로 시작하며 누적
                    점수는 유지됩니다.
                  </p>
                  <p>
                    세부 점수는 이번 주 / 누적 순서입니다. 골드·길드 보상
                    10,000G당 1점, 길드 명성 1당 10점, 식당·교역 기존 기여
                    1점당 10점으로 환산하며 시설 재료는 희소도를 반영합니다.
                  </p>
                  <p>
                    기본 시설 활동 1회는 10점이며, 길드원이 함께 달성하는
                    제작소·탐사 공동 보상은 개인 기여도에 포함되지 않습니다.
                  </p>
                  {canViewDetails && (
                    <p className="font-medium text-sky-700 dark:text-sky-300">
                      길드원을 선택하면 기부액과 상세 기여 내역을 볼 수 있습니다.
                    </p>
                  )}
                </div>
              }
              triggerClassName="inline-flex h-7 w-7 items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-600 transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <Question size={14} weight="bold" aria-hidden />
              <span className="sr-only">길드 기여도 도움말</span>
            </Tooltip>
          </div>
          <div className="shrink-0 text-right text-xs tabular-nums">
            <div className="font-semibold text-sky-700 dark:text-sky-300">
              이번 주 {(viewer?.weeklyPoints ?? 0).toLocaleString()}점
            </div>
            <div className="mt-0.5 text-zinc-500 dark:text-zinc-400">
              누적 {(viewer?.lifetimePoints ?? 0).toLocaleString()}점
            </div>
          </div>
        </div>

        {viewer && (
          <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {GUILD_CONTRIBUTION_CATEGORIES.map((category) => (
              <div key={category} className={`${SURFACE_INSET} px-2 py-1.5`}>
                <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
                  {GUILD_CONTRIBUTION_CATEGORY_LABEL[category]}
                </div>
                <div className="mt-0.5 text-xs font-medium tabular-nums">
                  {(viewer.weeklyByCategory[category] ?? 0).toLocaleString()}
                  <span className="ml-1 text-[10px] font-normal text-zinc-600 dark:text-zinc-400">
                    / {(viewer.lifetimeByCategory[category] ?? 0).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-[2rem_minmax(0,1fr)_auto_auto] gap-2 border-b border-zinc-200 px-3 py-2 text-[10px] font-medium text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
        <span>순위</span>
        <span>길드원</span>
        <span className="text-right">이번 주</span>
        <span className="w-16 text-right">누적</span>
      </div>
      {loading && !data ? (
        <div className="px-3 py-5 text-center text-xs text-zinc-500 dark:text-zinc-400">
          기여도를 불러오는 중…
        </div>
      ) : (data?.rows.length ?? 0) === 0 ? (
        <div className="px-3 py-5 text-center text-xs text-zinc-500 dark:text-zinc-400">
          아직 기록된 기여 활동이 없습니다.
        </div>
      ) : (
        <ol className="divide-y divide-zinc-200 dark:divide-zinc-700">
          {data?.rows.map((row, index) => {
            const mine = row.userId === data.viewerUserId;
            const member = memberByUser.get(row.userId);
            const rowClassName = `grid w-full grid-cols-[2rem_minmax(0,1fr)_auto_auto] items-center gap-2 px-3 py-2 text-left text-xs ${
              mine
                ? "bg-sky-50 text-sky-900 dark:bg-zinc-800 dark:text-sky-100"
                : "bg-white dark:bg-zinc-900"
            }`;
            const cells = (
              <>
                <span className="font-medium tabular-nums text-zinc-400 dark:text-zinc-500">
                  {index + 1}
                </span>
                <span className="truncate font-medium">
                  {member?.name ?? "모험가"}
                  {mine && (
                    <span className="ml-1 text-[10px] font-normal text-sky-600 dark:text-sky-300">
                      나
                    </span>
                  )}
                </span>
                <span className="text-right font-semibold tabular-nums">
                  {row.weeklyPoints.toLocaleString()}
                </span>
                <span className="w-16 text-right tabular-nums text-zinc-500 dark:text-zinc-400">
                  {row.lifetimePoints.toLocaleString()}
                </span>
              </>
            );
            return (
              <li key={row.userId}>
                {canViewDetails && member ? (
                  <button
                    type="button"
                    className={`${rowClassName} transition-colors hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 dark:hover:bg-sky-950`}
                    aria-label={`${member.name} 기여 상세 보기`}
                    onClick={() =>
                      setSelectedMember({
                        userId: member.userId,
                        name: member.name,
                        role: member.role,
                      })
                    }
                  >
                    {cells}
                  </button>
                ) : (
                  <div className={rowClassName}>{cells}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {canViewDetails && selectedMember && (
        <GuildContributionDetailDialog
          member={selectedMember}
          onClose={() => setSelectedMember(null)}
        />
      )}
    </section>
  );
}
