"use client";

import { useState } from "react";
import {
  GUILD_FACILITY_UNLOCK_GOLD_COST,
  PLACEABLE_SETTLEMENT_BUILDING_IDS,
  SETTLEMENT_BUILDINGS,
  explorationHqUpgradeForLevel,
  type SettlementBuildingId,
} from "@/adventure/data/v2/settlement";
import type { GuildInfoResponse, Notice } from "./guildShared";
import { GuildTrainingGroundPanel } from "./GuildTrainingGroundPanel";
import { GuildWorkshopPanel } from "./GuildWorkshopPanel";

const FACILITY_DESC: Partial<Record<SettlementBuildingId, string>> = {
  guild_smithy: "장비 제작과 대장장이 성장을 지원하는 길드 공용 시설입니다.",
  training_ground: "길드원이 매일 직업 숙련도 훈련을 받을 수 있는 시설입니다.",
  exploration_hq: "주간 길드 탐사 의뢰와 원정 진척을 관리하는 시설입니다.",
};

// 기존 영지 건축물 카운트를 길드 화면의 공용 시설로만 표시한다.
export function GuildFacilitiesPanel({
  guildId,
  info,
  canUnlockFacilities,
  onChanged,
  onNotice,
}: {
  guildId: number | null;
  info: GuildInfoResponse | null;
  canUnlockFacilities?: boolean;
  onChanged?: () => void;
  onNotice?: (notice: Notice) => void;
}) {
  const [unlockingId, setUnlockingId] = useState<SettlementBuildingId | null>(
    null,
  );
  const [activeFacility, setActiveFacility] =
    useState<SettlementBuildingId | null>(null);

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
      name: def.name,
      desc: FACILITY_DESC[id] ?? def.desc.replaceAll("영지 ", ""),
      actionLabel: id === "exploration_hq" ? "현황" : "열기",
      cost: GUILD_FACILITY_UNLOCK_GOLD_COST[id] ?? 0,
    };
  });
  const hasAny = rows.some((row) => row.count > 0);
  const guildGold = info?.guildGold ?? 0;

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
    const level = info?.settlementBuildingLevels?.exploration_hq ?? 0;
    const upgrade = explorationHqUpgradeForLevel(Math.max(1, level));
    return (
      <div className="space-y-3">
        <FacilityBackButton onClick={() => setActiveFacility(null)} />
        <section className="rounded-md border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span aria-hidden>{SETTLEMENT_BUILDINGS.exploration_hq.icon}</span>
                <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {SETTLEMENT_BUILDINGS.exploration_hq.name}
                </h3>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                길드 단위 주간 탐사 의뢰의 슬롯과 진척 보너스를 관리합니다.
              </p>
            </div>
            <span className="rounded bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
              Lv.{Math.max(1, level)}
            </span>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded bg-zinc-50 px-3 py-2 dark:bg-zinc-900">
              <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                주간 탐사
              </dt>
              <dd className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">
                {upgrade.weeklyMissionCount}건
              </dd>
            </div>
            <div className="rounded bg-zinc-50 px-3 py-2 dark:bg-zinc-900">
              <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                진척 보너스
              </dt>
              <dd className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">
                +{upgrade.missionProgressBonusPct}%
              </dd>
            </div>
          </dl>
        </section>
      </div>
    );
  }

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
                {row.count <= 0 && (
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
                <button
                  type="button"
                  onClick={() => setActiveFacility(row.id)}
                  className="mt-2 rounded-md border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
                >
                  {row.name} {row.actionLabel}
                </button>
              )}
              {row.count <= 0 && (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="min-w-0 text-xs text-zinc-500 dark:text-zinc-400">
                    길드 금고 {guildGold.toLocaleString()}G
                  </p>
                  {canUnlockFacilities ? (
                    <button
                      type="button"
                      onClick={() => unlockFacility(row.id)}
                      disabled={
                        unlockingId != null ||
                        row.cost <= 0 ||
                        guildGold < row.cost
                      }
                      className="shrink-0 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                    >
                      {unlockingId === row.id ? "개방 중" : "개방"}
                    </button>
                  ) : (
                    <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
                      관리 권한 필요
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {!hasAny && (
        <p className="rounded-md border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
          아직 개방된 길드 시설이 없습니다. 길드 금고를 사용해 필요한 시설부터
          열 수 있습니다.
        </p>
      )}
    </div>
  );
}

function FacilityBackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 items-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
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
