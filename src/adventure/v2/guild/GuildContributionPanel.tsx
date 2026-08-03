import {
  GUILD_CONTRIBUTION_CATEGORIES,
  GUILD_CONTRIBUTION_CATEGORY_LABEL,
} from "@/adventure/data/v2/guildContribution";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import type {
  GuildContributionResponse,
  GuildInfoResponse,
} from "./guildShared";

export function GuildContributionPanel({
  data,
  info,
  loading,
}: {
  data: GuildContributionResponse | null;
  info: GuildInfoResponse | null;
  loading: boolean;
}) {
  const nameByUser = new Map(
    (info?.members ?? []).map((member) => [member.userId, member.name]),
  );
  const viewer = data?.rows.find((row) => row.userId === data.viewerUserId);

  return (
    <section className={`${SURFACE_CARD} overflow-hidden`}>
      <div className="border-b border-zinc-200 px-3 py-3 dark:border-zinc-700">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">길드 기여도</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              이번 주 점수는 매주 월요일 00:00(KST)에 새로 시작하며 누적 점수는 유지됩니다.
            </p>
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
                  <span className="ml-1 text-[10px] font-normal text-zinc-400 dark:text-zinc-500">
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
            return (
              <li
                key={row.userId}
                className={`grid grid-cols-[2rem_minmax(0,1fr)_auto_auto] items-center gap-2 px-3 py-2 text-xs ${
                  mine
                    ? "bg-sky-50 text-sky-900 dark:bg-sky-950 dark:text-sky-100"
                    : "bg-white dark:bg-zinc-900"
                }`}
              >
                <span className="font-medium tabular-nums text-zinc-400 dark:text-zinc-500">
                  {index + 1}
                </span>
                <span className="truncate font-medium">
                  {nameByUser.get(row.userId) ?? "모험가"}
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
              </li>
            );
          })}
        </ol>
      )}
      <div className="border-t border-zinc-200 px-3 py-2 text-[10px] leading-relaxed text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
        세부 점수는 이번 주 / 누적 순서입니다. 골드·길드 보상 10,000G당 1점,
        길드 명성 1당 10점, 식당·교역 기존 기여 1점당 10점으로 환산하며 시설
        재료는 희소도를 반영합니다. 기본 시설 활동 1회는 10점입니다.
      </div>
    </section>
  );
}
