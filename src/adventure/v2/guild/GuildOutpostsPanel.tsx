import { useState } from "react";
import {
  GUILD_SMITHY_UPGRADES,
  PRODUCTION_KINDS,
  SETTLEMENT_BUILDING_IDS,
  SETTLEMENT_BUILDINGS,
  nextGuildSmithyUpgrade,
  settlementBuildingUpgradeCostText,
  type SettlementBuildingId,
} from "@/adventure/data/v2/settlement";
import type { GuildInfoResponse } from "./guildShared";

const FACILITY_DESC: Partial<Record<string, string>> = {
  guild_smithy: "장비 제작과 대장장이 성장을 지원하는 길드 공용 시설입니다.",
};

function facilityRows(info: GuildInfoResponse | null) {
  return SETTLEMENT_BUILDING_IDS.map((id) => {
    const def = SETTLEMENT_BUILDINGS[id];
    const count = info?.settlementBuildings?.[id] ?? 0;
    const level = info?.settlementBuildingLevels?.[id] ?? (count > 0 ? 1 : 0);
    return {
      id,
      count,
      level,
      icon: def.icon,
      name: def.name,
      desc: FACILITY_DESC[id] ?? def.desc.replaceAll("영지 ", ""),
    };
  });
}

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

  const rows = facilityRows(info);
  const hasAny = rows.some((row) => row.level > 0);

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
              className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900"
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
                  {row.id !== "guild_smithy" && row.level <= 0 && (
                    <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                      준비 중
                    </p>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded px-2 py-1 text-xs font-semibold tabular-nums ${
                    row.level > 0
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                      : "bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  {row.level > 0 ? `Lv ${row.level}` : "미개방"}
                </span>
              </div>
              {row.level > 0 && onOpenFacility && row.id === "guild_smithy" && (
                <div className="mt-2 space-y-2 border-t border-zinc-200 pt-2 dark:border-zinc-700">
                  <button
                    type="button"
                    onClick={() => onOpenFacility(row.id)}
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                  >
                    {row.name} 열기
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {!hasAny && (
        <p className="rounded-md border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
          아직 개방된 길드 시설이 없습니다.
        </p>
      )}
    </div>
  );
}

export function GuildFacilitiesManagePanel({
  info,
  onChanged,
}: {
  info: GuildInfoResponse | null;
  onChanged?: () => void;
}) {
  const [busyId, setBusyId] = useState<SettlementBuildingId | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const rows = facilityRows(info);
  const resources = info?.settlementResources ?? {};

  async function upgradeSmithy() {
    setBusyId("guild_smithy");
    setMessage(null);
    try {
      const res = await fetch("/api/v2/guild/facilities/smithy/upgrade", {
        method: "POST",
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        smithyLevel?: number;
      } | null;
      if (!res.ok || !json?.ok) {
        setMessage(
          json?.error === "insufficient_resources"
            ? "재료가 부족합니다."
            : json?.error === "not_authorized"
              ? "길드장 또는 부길드장만 사용할 수 있습니다."
              : "처리하지 못했습니다.",
        );
        return;
      }
      setMessage(`길드 대장간 Lv ${json.smithyLevel ?? 1} 적용 완료`);
      onChanged?.();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        시설 관리
      </div>
      <div className="grid gap-2">
        {rows.map((row) => {
          const next =
            row.id === "guild_smithy"
              ? row.level <= 0
                ? GUILD_SMITHY_UPGRADES[0]
                : nextGuildSmithyUpgrade(row.level)
              : null;
          const canAfford =
            next != null &&
            PRODUCTION_KINDS.every(
              (kind) => (resources[kind] ?? 0) >= (next.cost[kind] ?? 0),
            );
          return (
            <div
              key={row.id}
              className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900"
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
                    row.level > 0
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                      : "bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  {row.level > 0 ? `Lv ${row.level}` : "미개방"}
                </span>
              </div>

              {row.id === "guild_smithy" ? (
                <div className="mt-2 space-y-2 border-t border-zinc-200 pt-2 dark:border-zinc-700">
                  {next ? (
                    <>
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium text-zinc-700 dark:text-zinc-200">
                          {row.level <= 0
                            ? `개방: Lv ${next.level} · ${next.label}`
                            : `다음: Lv ${next.level} · ${next.label}`}
                        </span>
                        <span className="text-[11px] text-emerald-600 dark:text-emerald-300">
                          품질 +{next.qualityChanceBonusPct}%p
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        비용 {settlementBuildingUpgradeCostText(next.cost)}
                      </div>
                      <button
                        type="button"
                        disabled={busyId === row.id || !canAfford}
                        onClick={() => void upgradeSmithy()}
                        className="w-full rounded-md border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {busyId === row.id
                          ? "처리 중..."
                          : row.level <= 0
                            ? "대장간 개방"
                            : "대장간 업그레이드"}
                      </button>
                    </>
                  ) : (
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      최고 레벨입니다.
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-2 border-t border-zinc-200 pt-2 text-[11px] text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
                  준비 중
                </p>
              )}
            </div>
          );
        })}
      </div>

      {message && (
        <p className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
          {message}
        </p>
      )}
    </div>
  );
}
