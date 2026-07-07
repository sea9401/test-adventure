import { PlayerNameLink } from "@/components/ui/PlayerNameLink";
import type { GuildInfoResponse } from "./guildShared";

export function GuildArtisanContributionPanel({
  info,
}: {
  info: GuildInfoResponse | null;
}) {
  const artisanLeaders = [...(info?.members ?? [])]
    .map((m) => ({
      userId: m.userId,
      name: m.name,
      level: m.artisan?.blacksmith?.level ?? 1,
      xpIntoLevel: m.artisan?.blacksmith?.xpIntoLevel ?? 0,
      xpForNext: m.artisan?.blacksmith?.xpForNext ?? 100,
      totalCrafts: m.artisan?.blacksmith?.totalCrafts ?? 0,
      qualityCrafts: m.artisan?.blacksmith?.qualityCrafts ?? 0,
    }))
    .filter((m) => m.totalCrafts > 0 || m.qualityCrafts > 0 || m.level > 1)
    .sort((a, b) => {
      if (b.totalCrafts !== a.totalCrafts) return b.totalCrafts - a.totalCrafts;
      if (b.qualityCrafts !== a.qualityCrafts) {
        return b.qualityCrafts - a.qualityCrafts;
      }
      return b.level - a.level;
    })
    .slice(0, 5);

  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          제작 기여도
        </h3>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          대장장이 기준
        </span>
      </div>
      {artisanLeaders.length > 0 ? (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {artisanLeaders.map((m, idx) => (
            <div
              key={m.userId}
              className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 py-2"
            >
              <div className="text-xs font-semibold tabular-nums text-zinc-500 dark:text-zinc-400">
                #{idx + 1}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  <PlayerNameLink name={m.name} />
                </div>
                <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  Lv {m.level.toLocaleString()} · 숙련도{" "}
                  {m.xpIntoLevel.toLocaleString()}/
                  {m.xpForNext.toLocaleString()}
                </div>
              </div>
              <div className="text-right text-xs">
                <div className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                  {m.totalCrafts.toLocaleString()}회
                </div>
                <div className="text-zinc-500 dark:text-zinc-400">
                  품질 {m.qualityCrafts.toLocaleString()}회
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-zinc-200 px-3 py-3 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          아직 길드 대장간 제작 기록이 없어요.
        </div>
      )}
    </div>
  );
}
