import { GUILD_MAX_MEMBERS } from "@/adventure/data/guild";
import { SETTLEMENT_BUILDINGS } from "@/adventure/data/v2/settlement";
import { PlayerNameLink } from "@/components/ui/PlayerNameLink";
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
  const smithyCount = info?.settlementBuildings?.guild_smithy ?? 0;
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
            <dt className="text-zinc-500 dark:text-zinc-400">영지 시설</dt>
            <dd className="truncate font-medium">
              {smithyCount > 0
                ? `${SETTLEMENT_BUILDINGS.guild_smithy.icon} ${SETTLEMENT_BUILDINGS.guild_smithy.name} ×${smithyCount}`
                : "없음"}
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

      <div className="rounded-md border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">
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
          <div className="rounded-md border border-dashed border-zinc-200 px-3 py-3 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            아직 길드 대장간 제작 기록이 없어요.
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
