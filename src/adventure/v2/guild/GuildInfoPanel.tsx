import { GUILD_MAX_MEMBERS } from "@/adventure/data/guild";
import { GuildGoldDepositPanel } from "../GuildGoldDepositPanel";
import {
  GuildActivityList,
  type GuildActivity,
} from "../GuildActivityList";
import { fmtDate, type GuildInfoResponse } from "./guildShared";

// 길드 정보 탭 — 정보 카드 · 금고 입금 · 활동 내역. (V2GuildHome 에서 추출, 거동 불변)
export function GuildInfoPanel({
  info,
  loading,
  activity,
  onRefresh,
}: {
  info: GuildInfoResponse | null;
  loading: boolean;
  activity: GuildActivity[];
  onRefresh: () => void;
}) {
  return info?.guild ? (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-md border border-zinc-200 bg-zinc-50 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <dl className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {info.guild.nationName && (
            <div className="flex items-center justify-between gap-3 px-3 py-2.5">
              <dt className="text-zinc-500 dark:text-zinc-400">국가</dt>
              <dd className="truncate font-semibold text-indigo-600 dark:text-indigo-400">
                {info.guild.nationName}
              </dd>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 px-3 py-2.5">
            <dt className="text-zinc-500 dark:text-zinc-400">길드마스터</dt>
            <dd className="truncate font-medium">
              {info.members?.find((m) => m.role === "master")?.name ?? "—"}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-3 py-2.5">
            <dt className="text-zinc-500 dark:text-zinc-400">길드원 수</dt>
            <dd className="font-medium tabular-nums">
              {info.members?.length ?? 0} / {info.memberCap ?? GUILD_MAX_MEMBERS}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-3 py-2.5">
            <dt className="text-zinc-500 dark:text-zinc-400">명성</dt>
            <dd className="font-medium tabular-nums">
              {info.guild.fameTotal.toLocaleString()}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-3 py-2.5">
            <dt className="text-zinc-500 dark:text-zinc-400">길드 자금</dt>
            <dd className="font-medium tabular-nums text-amber-700 dark:text-amber-400">
              {(info.guildGold ?? 0).toLocaleString()} G
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-3 py-2.5">
            <dt className="text-zinc-500 dark:text-zinc-400">창설</dt>
            <dd className="font-medium tabular-nums">
              {fmtDate(info.guild.createdAt)}
            </dd>
          </div>
        </dl>
        {info.guild.description && (
          <div className="border-t border-zinc-200 px-3 py-2.5 text-xs leading-relaxed text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
            {info.guild.description}
          </div>
        )}
      </div>

      {/* 길드 금고 입금 — 거점 화면에서 이관. 점령/공성 비용 재원 충원.
          입금 후 refresh 로 정보 카드 '길드 자금'·활동 내역도 갱신. */}
      <GuildGoldDepositPanel onChanged={onRefresh} />

      {/* 길드원 활동 내역 — 가입·임명·입금·국가선포·창단. */}
      <GuildActivityList activity={activity} loading={loading} />
    </div>
  ) : (
    <div className="text-sm text-zinc-500 dark:text-zinc-400">
      {loading ? "불러오는 중…" : "—"}
    </div>
  );
}
