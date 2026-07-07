import {
  PLACEABLE_SETTLEMENT_BUILDING_IDS,
  SETTLEMENT_BUILDINGS,
  type SettlementBuildingId,
} from "@/adventure/data/v2/settlement";
import type { GuildInfoResponse } from "./guildShared";

const FACILITY_LABEL: Partial<Record<SettlementBuildingId, string>> = {
};

const FACILITY_DESC: Partial<Record<SettlementBuildingId, string>> = {
  guild_smithy: "장비 제작과 대장장이 성장을 지원하는 길드 공용 시설입니다.",
  training_ground: "길드원이 매일 직업 숙련도 훈련을 받을 수 있는 시설입니다.",
};

// 기존 영지 건축물 카운트를 길드 화면의 공용 시설로만 표시한다.
export function GuildFacilitiesPanel({
  guildId,
  info,
  onOpenFacility,
}: {
  guildId: number | null;
  info: GuildInfoResponse | null;
  onOpenFacility?: (id: SettlementBuildingId) => void;
}) {
  if (guildId == null) {
    return (
      <div className="text-sm text-zinc-500 dark:text-zinc-400">
        소속 길드가 없어요.
      </div>
    );
  }

  const rows = PLACEABLE_SETTLEMENT_BUILDING_IDS.filter(
    (id) => id !== "map_workshop",
  ).map((id) => {
    const def = SETTLEMENT_BUILDINGS[id];
    const count = info?.settlementBuildings?.[id] ?? 0;
    return {
      id,
      count,
      icon: def.icon,
      name: FACILITY_LABEL[id] ?? def.name,
      desc: FACILITY_DESC[id] ?? def.desc.replaceAll("영지 ", ""),
      actionLabel: "열기",
    };
  });
  const hasAny = rows.some((row) => row.count > 0);

  return (
    <div className="space-y-3">
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          길드 시설
        </h3>
        <div className="grid gap-2">
          {rows.map((row) => (
            <div
              key={row.id}
              className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span aria-hidden>{row.icon}</span>
                    <span className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                      {row.name}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                    {row.desc}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded px-2 py-1 text-xs font-semibold tabular-nums ${
                    row.count > 0
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                      : "bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  x{row.count}
                </span>
              </div>
              {row.count > 0 && onOpenFacility && (
                <button
                  type="button"
                  onClick={() => onOpenFacility(row.id)}
                  className="mt-2 rounded-md border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
                >
                  {row.name} {row.actionLabel}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {!hasAny && (
        <p className="rounded-md border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
          아직 배치된 길드 시설이 없습니다. 기존 영지 건물은 이곳에서 길드
          시설로 표시됩니다.
        </p>
      )}
    </div>
  );
}
