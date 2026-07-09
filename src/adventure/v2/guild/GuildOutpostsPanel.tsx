"use client";

import { useState } from "react";
import {
  GUILD_FACILITY_UNLOCK_GOLD_COST,
  PLACEABLE_SETTLEMENT_BUILDING_IDS,
  PRODUCTION_KINDS,
  SETTLEMENT_BUILDINGS,
  nextGuildSmithyUpgrade,
  settlementBuildingUpgradeCostText,
  settlementBuildingUpgradeSummary,
  type SettlementBuildingId,
} from "@/adventure/data/v2/settlement";
import type { GuildInfoResponse, Notice } from "./guildShared";
import { GuildExplorationPanel } from "./GuildExplorationPanel";
import { GuildTrainingGroundPanel } from "./GuildTrainingGroundPanel";
import { GuildWorkshopPanel } from "./GuildWorkshopPanel";

const FACILITY_DESC: Partial<Record<SettlementBuildingId, string>> = {
  guild_smithy: "장비 제작과 대장장이 성장을 지원하는 길드 공용 시설입니다.",
  training_ground: "길드원이 매일 직업 숙련도 훈련을 받을 수 있는 시설입니다.",
  exploration_hq: "주간 길드 탐사 의뢰와 원정 진척을 관리하는 시설입니다.",
};

const VISIBLE_GUILD_FACILITY_IDS = [
  "guild_smithy",
  "training_ground",
  "exploration_hq",
  "alchemy_workshop",
  "woodworks",
] satisfies SettlementBuildingId[];

// 기존 영지 건축물 카운트를 길드 화면의 공용 시설로만 표시한다.
export function GuildFacilitiesPanel({
  guildId,
  info,
  onChanged,
}: {
  guildId: number | null;
  info: GuildInfoResponse | null;
  onChanged?: () => void;
}) {
  const [activeFacility, setActiveFacility] =
    useState<SettlementBuildingId | null>(null);

  if (guildId == null) {
    return (
      <div className="text-sm text-zinc-500 dark:text-zinc-400">
        소속 길드가 없어요.
      </div>
    );
  }

  const rows = VISIBLE_GUILD_FACILITY_IDS.map((id) => {
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
      actionLabel: id === "exploration_hq" ? "현황" : "열기",
      cost: GUILD_FACILITY_UNLOCK_GOLD_COST[id] ?? 0,
    };
  });
  const hasAny = rows.some((row) => row.count > 0);

  if (activeFacility === "guild_smithy") {
    return (
      <div className="space-y-3">
        <FacilityBackButton onClick={() => setActiveFacility(null)} />
        <GuildWorkshopPanel info={info} />
      </div>
    );
  }

  if (activeFacility === "training_ground") {
    return (
      <div className="space-y-3">
        <FacilityBackButton onClick={() => setActiveFacility(null)} />
        <GuildTrainingGroundPanel info={info} onChanged={onChanged} />
      </div>
    );
  }

  if (activeFacility === "exploration_hq") {
    return (
      <div className="space-y-3">
        <FacilityBackButton onClick={() => setActiveFacility(null)} />
        <GuildExplorationPanel onChanged={onChanged} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          길드 시설
        </h3>
        <div className="grid gap-2 md:grid-cols-2">
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex min-h-[96px] flex-col justify-between rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900"
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
                {row.count > 0 ? (
                  <div className="shrink-0 text-right">
                    <span className="inline-flex rounded bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                      Lv {row.level}
                    </span>
                  </div>
                ) : (
                  <div className="shrink-0 text-right">
                    <span className="inline-flex rounded bg-zinc-200 px-2 py-1 text-xs font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                      미개방
                    </span>
                    {row.cost > 0 && (
                      <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                        {row.cost.toLocaleString()}G
                      </div>
                    )}
                  </div>
                )}
              </div>
              {row.count > 0 && (
                <div className="mt-2 space-y-2">
                  {isOpenableFacility(row.id) ? (
                    <button
                      type="button"
                      onClick={() => setActiveFacility(row.id)}
                      className="rounded-md border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
                    >
                      {row.name} {row.actionLabel}
                    </button>
                  ) : (
                    <p className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
                      준비 중인 시설입니다.
                    </p>
                  )}
                </div>
              )}
              {row.count <= 0 && (
                <div className="mt-2">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {PLACEABLE_SETTLEMENT_BUILDING_IDS.includes(row.id)
                      ? "관리 탭에서 개방할 수 있습니다."
                      : "아직 개방할 수 없는 시설입니다."}
                  </p>
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
  canManage,
  onChanged,
  onNotice,
}: {
  info: GuildInfoResponse | null;
  canManage: boolean;
  onChanged?: () => void;
  onNotice?: (notice: Notice) => void;
}) {
  const [unlockingId, setUnlockingId] = useState<SettlementBuildingId | null>(
    null,
  );
  const [upgradingId, setUpgradingId] = useState<SettlementBuildingId | null>(
    null,
  );
  const guildGold = info?.guildGold ?? 0;
  const guildFame = info?.guild?.fameAvailable ?? 0;
  const settlementResources = info?.settlementResources ?? {};
  const rows = VISIBLE_GUILD_FACILITY_IDS.map((id) => {
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
      cost: GUILD_FACILITY_UNLOCK_GOLD_COST[id] ?? 0,
    };
  });

  async function unlockFacility(id: SettlementBuildingId) {
    if (unlockingId) return;
    setUnlockingId(id);
    try {
      const res = await fetch("/api/v2/guild/facilities/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buildingId: id }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!res.ok || !json?.ok) {
        onNotice?.({ kind: "err", text: facilityUnlockErrorText(json?.error) });
        return;
      }
      const def = SETTLEMENT_BUILDINGS[id];
      onNotice?.({ kind: "ok", text: `${def.name} 개방 완료` });
      onChanged?.();
    } catch {
      onNotice?.({ kind: "err", text: "시설 개방에 실패했습니다." });
    } finally {
      setUnlockingId(null);
    }
  }

  async function upgradeSmithy() {
    if (upgradingId) return;
    setUpgradingId("guild_smithy");
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
        onNotice?.({
          kind: "err",
          text: facilityUpgradeErrorText(json?.error),
        });
        return;
      }
      onNotice?.({
        kind: "ok",
        text: `길드 대장간 Lv ${json.smithyLevel ?? ""} 업그레이드 완료`,
      });
      onChanged?.();
    } catch {
      onNotice?.({ kind: "err", text: "시설 업그레이드에 실패했습니다." });
    } finally {
      setUpgradingId(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        시설 관리
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {rows.map((row) => {
          const canUnlock = PLACEABLE_SETTLEMENT_BUILDING_IDS.includes(row.id);
          const next =
            row.id === "guild_smithy" && row.count > 0
              ? nextGuildSmithyUpgrade(row.level)
              : null;
          const canAffordUpgrade =
            next != null &&
            PRODUCTION_KINDS.every(
              (kind) =>
                (settlementResources[kind] ?? 0) >= (next.cost[kind] ?? 0),
            ) &&
            guildGold >= (next.cost.gold ?? 0) &&
            guildFame >= (next.cost.fame ?? 0);
          return (
            <div
              key={row.id}
              className="flex min-h-[112px] flex-col justify-between rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900"
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
                  {row.count > 0 ? `Lv ${row.level}` : "미개방"}
                </span>
              </div>

              {row.count <= 0 ? (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="min-w-0 text-xs text-zinc-500 dark:text-zinc-400">
                    {canUnlock && row.cost > 0
                      ? `비용 ${row.cost.toLocaleString()}G · 길드 금고 ${guildGold.toLocaleString()}G`
                      : "준비 중"}
                  </p>
                  {canUnlock && row.cost > 0 && canManage && (
                    <button
                      type="button"
                      onClick={() => void unlockFacility(row.id)}
                      disabled={unlockingId != null || guildGold < row.cost}
                      className="shrink-0 rounded-md border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {unlockingId === row.id ? "개방 중" : "개방"}
                    </button>
                  )}
                </div>
              ) : row.id === "guild_smithy" ? (
                <div className="mt-2 rounded-md border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950">
                  {next ? (
                    <>
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                          다음: Lv {next.level} · {next.label}
                        </span>
                        <span className="text-[11px] text-emerald-600 dark:text-emerald-300">
                          {settlementBuildingUpgradeSummary(row.id, next)}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                        비용 {settlementBuildingUpgradeCostText(next.cost)}
                      </div>
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => void upgradeSmithy()}
                          disabled={upgradingId != null || !canAffordUpgrade}
                          className="mt-2 w-full rounded-md border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {upgradingId === row.id
                            ? "업그레이드 중"
                            : "대장간 업그레이드"}
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      대장간 최고 레벨입니다.
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function isOpenableFacility(id: SettlementBuildingId): boolean {
  return (
    id === "guild_smithy" ||
    id === "training_ground" ||
    id === "exploration_hq"
  );
}

function FacilityBackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 items-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-900"
    >
      시설 목록
    </button>
  );
}

function facilityUnlockErrorText(error?: string): string {
  switch (error) {
    case "no_guild":
      return "소속 길드가 없습니다.";
    case "not_authorized":
      return "시설 개방 권한이 없습니다.";
    case "already_unlocked":
      return "이미 개방된 시설입니다.";
    case "insufficient_gold":
      return "길드 금고 골드가 부족합니다.";
    case "invalid_building":
    case "building_unavailable":
      return "아직 개방할 수 없는 시설입니다.";
    default:
      return "시설 개방에 실패했습니다.";
  }
}

function facilityUpgradeErrorText(error?: string): string {
  switch (error) {
    case "no_guild":
      return "소속 길드가 없습니다.";
    case "not_authorized":
      return "시설 업그레이드 권한이 없습니다.";
    case "smithy_required":
      return "먼저 길드 대장간을 개방해야 합니다.";
    case "max_level":
      return "이미 최고 레벨입니다.";
    case "insufficient_resources":
      return "업그레이드 재료가 부족합니다.";
    case "insufficient_gold":
      return "길드 금고 골드가 부족합니다.";
    case "insufficient_fame":
      return "사용 가능한 길드 명성이 부족합니다.";
    default:
      return "시설 업그레이드에 실패했습니다.";
  }
}
