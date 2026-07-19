import {
  GUILD_BASE_MEMBER_CAP,
  GUILD_MAX_LEVEL,
} from "@/adventure/data/guild";
import { SURFACE_CARD } from "@/components/ui/surfaces";
import {
  PLACEABLE_SETTLEMENT_BUILDING_IDS,
  SETTLEMENT_BUILDINGS,
} from "@/adventure/data/v2/settlement";
import { GuildGoldDepositPanel } from "../GuildGoldDepositPanel";
import {
  GuildActivityList,
  type GuildActivity,
} from "../GuildActivityList";
import { GuildCombatSupplySummary } from "./GuildCombatSupplyPanel";
import { GuildEmblemImage } from "./GuildEmblemImage";
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
  const facilityLabels = PLACEABLE_SETTLEMENT_BUILDING_IDS.map((id) => {
    const count = info?.settlementBuildings?.[id] ?? 0;
    const def = SETTLEMENT_BUILDINGS[id];
    const level = info?.settlementBuildingLevels?.[id] ?? 1;
    const suffix = count > 1 ? ` Lv.${level} ×${count}` : ` Lv.${level}`;
    return count > 0 ? `${def.icon} ${def.name}${suffix}` : null;
  }).filter((label): label is string => Boolean(label));
  const levelProgressPct = info?.guild?.fameForNextLevel
    ? Math.min(
        100,
        Math.floor(
          (info.guild.fameIntoLevel / info.guild.fameForNextLevel) * 100,
        ),
      )
    : 100;

  return info?.guild ? (
    <div className="space-y-3">
      <div className={`${SURFACE_CARD} overflow-hidden text-sm`}>
        <div className="flex items-center gap-3 border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">
          <GuildEmblemImage
            emblem={info.guild.emblem}
            guildName={info.guild.name}
            className="h-16 w-16"
          />
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <div className="truncate text-base font-semibold">{info.guild.name}</div>
              <span className="shrink-0 rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-semibold text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                Lv.{info.guild.level}
              </span>
            </div>
            <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              {info.guild.nationName ? `${info.guild.nationName} 소속 길드` : "모험가 길드"}
            </div>
          </div>
        </div>
        <div className="border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="font-medium text-zinc-700 dark:text-zinc-200">
              길드 레벨 {info.guild.level} / {GUILD_MAX_LEVEL}
            </span>
            <span className="tabular-nums text-zinc-500 dark:text-zinc-400">
              {info.guild.fameForNextLevel === null
                ? "최고 레벨 달성"
                : `${info.guild.fameIntoLevel.toLocaleString()} / ${info.guild.fameForNextLevel.toLocaleString()} EXP`}
            </span>
          </div>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700"
            role="progressbar"
            aria-label="길드 레벨 경험치"
            aria-valuemin={0}
            aria-valuemax={info.guild.fameForNextLevel ?? 1}
            aria-valuenow={
              info.guild.fameForNextLevel === null
                ? 1
                : info.guild.fameIntoLevel
            }
          >
            <div
              className="h-full rounded-full bg-sky-500 transition-[width]"
              style={{ width: `${levelProgressPct}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            누적 명성이 길드 경험치가 되며, 레벨이 오를 때마다 정원이 1명 늘어납니다.
          </p>
        </div>
        <dl className="divide-y divide-zinc-200 dark:divide-zinc-800">
          <div className="flex items-center justify-between gap-3 px-3 py-2.5">
            <dt className="text-zinc-500 dark:text-zinc-400">길드마스터</dt>
            <dd className="truncate font-medium">
              {info.members?.find((m) => m.role === "master")?.name ?? "—"}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-3 py-2.5">
            <dt className="text-zinc-500 dark:text-zinc-400">길드원 수</dt>
            <dd className="font-medium tabular-nums">
              {info.members?.length ?? 0} / {info.memberCap ?? GUILD_BASE_MEMBER_CAP}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-3 py-2.5">
            <dt className="text-zinc-500 dark:text-zinc-400">명성</dt>
            <dd className="font-medium tabular-nums">
              {info.guild.fameTotal.toLocaleString()}
              <span className="ml-1 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                사용 가능 {(info.guild.fameAvailable ?? 0).toLocaleString()}
              </span>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-3 py-2.5">
            <dt className="text-zinc-500 dark:text-zinc-400">길드 자금</dt>
            <dd className="font-medium tabular-nums text-amber-700 dark:text-amber-400">
              {(info.guildGold ?? 0).toLocaleString()} G
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-3 py-2.5">
            <dt className="text-zinc-500 dark:text-zinc-400">길드 시설</dt>
            <dd className="truncate font-medium">
              {facilityLabels.length > 0 ? facilityLabels.join(" · ") : "없음"}
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

      <GuildCombatSupplySummary />

      {/* 길드 금고 입금 — 길드 공용 자금 충원.
          입금 후 refresh 로 정보 카드 '길드 자금'·활동 내역도 갱신. */}
      <GuildGoldDepositPanel onChanged={onRefresh} />

      {/* 길드원 활동 내역 — 가입·임명·입금·창단. */}
      <GuildActivityList activity={activity} loading={loading} />
    </div>
  ) : (
    <div className="text-sm text-zinc-500 dark:text-zinc-400">
      {loading ? "불러오는 중…" : "—"}
    </div>
  );
}
