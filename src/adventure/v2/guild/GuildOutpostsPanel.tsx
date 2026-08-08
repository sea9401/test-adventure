"use client";

import { useState } from "react";
import { GameIcon } from "@/adventure/v2/GameIcon";
import {
  SETTLEMENT_BUILDINGS,
  nextSettlementBuildingUpgrade,
  type SettlementBuildingId,
} from "@/adventure/data/v2/settlement";
import type { GuildInfoResponse, Notice } from "./guildShared";
import { GuildExplorationPanel } from "./GuildExplorationPanel";
import { GuildTrainingGroundPanel } from "./GuildTrainingGroundPanel";
import { GuildWorkshopPanel } from "./GuildWorkshopPanel";
import { GuildFacilityUpgradeFund } from "./GuildFacilityUpgradeFund";
import { GuildAlchemyWorkshopPanel } from "./GuildAlchemyWorkshopPanel";
import { GuildDiningHallPanel } from "./GuildDiningHallPanel";
import { GuildTradePostPanel } from "./GuildTradePostPanel";
import { GuildWarehousePanel } from "./GuildWarehousePanel";
import {
  GUILD_FACILITY_IDS,
  GUILD_FACILITY_ICON_COLORS,
  type GuildFacilityId,
} from "./guildFacilities";

const FACILITY_DESC: Partial<Record<SettlementBuildingId, string>> = {
  guild_smithy: "장비 제작과 대장장이 성장을 지원하는 길드 공용 시설입니다.",
  training_ground: "길드원이 매일 직업 숙련도 훈련을 받을 수 있는 시설입니다.",
  exploration_hq: "주간 길드 탐사 의뢰와 원정 진척을 관리하는 시설입니다.",
  alchemy_workshop: "허브와 은빛잎으로 HP·MP 충전액을 조제하는 시설입니다.",
  dining_hall: "농장과 낚시 식재료를 함께 준비해 주간 식사를 제공하는 시설입니다.",
  trade_post: "채집품 주간 계약을 함께 완수하고 교역 토큰을 교환하는 시설입니다.",
  guild_warehouse: "길드 재료를 함께 보관하고 운영진이 필요한 곳에 배분하는 시설입니다.",
};

// 기존 영지 건축물 카운트를 길드 화면의 공용 시설로만 표시한다.
export function GuildFacilitiesPanel({
  guildId,
  info,
  canManage,
  activeFacility,
  onFacilityChange,
  onChanged,
  onNotice,
}: {
  guildId: number | null;
  info: GuildInfoResponse | null;
  canManage?: boolean;
  activeFacility: GuildFacilityId | null;
  onFacilityChange: (facility: GuildFacilityId | null) => void;
  onChanged?: () => void;
  onNotice?: (notice: Notice) => void;
}) {
  const [upgradingId, setUpgradingId] = useState<SettlementBuildingId | null>(
    null,
  );

  if (guildId == null) {
    return (
      <div className="text-sm text-zinc-500 dark:text-zinc-400">
        소속 길드가 없어요.
      </div>
    );
  }

  const rows = GUILD_FACILITY_IDS.map((id) => {
    const def = SETTLEMENT_BUILDINGS[id];
    const count = info?.settlementBuildings?.[id] ?? 0;
    const level = info?.settlementBuildingLevels?.[id] ?? (count > 0 ? 1 : 0);
    return {
      id,
      count,
      level,
      iconName: def.iconName,
      name: def.name,
      desc: FACILITY_DESC[id] ?? def.desc.replaceAll("영지 ", ""),
      actionLabel: id === "exploration_hq" ? "현황" : "열기",
    };
  });
  const guildGold = info?.guildGold ?? 0;
  const guildFame = info?.guild?.fameAvailable ?? 0;

  async function upgradeFacility(id: SettlementBuildingId) {
    if (!canManage || upgradingId) return;
    setUpgradingId(id);
    try {
      const res = await fetch(`/api/v2/guild/facilities/${id}/upgrade`, {
        method: "POST",
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        buildingLevel?: number;
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
        text: `${SETTLEMENT_BUILDINGS[id].name} Lv ${json.buildingLevel ?? ""} 업그레이드 완료`,
      });
      onChanged?.();
    } catch {
      onNotice?.({ kind: "err", text: "시설 업그레이드에 실패했습니다." });
    } finally {
      setUpgradingId(null);
    }
  }

  if (activeFacility === "guild_smithy") {
    return (
      <div className="space-y-3">
        <FacilityBackButton onClick={() => onFacilityChange(null)} />
        <GuildWorkshopPanel info={info} />
      </div>
    );
  }

  if (activeFacility === "training_ground") {
    return (
      <div className="space-y-3">
        <FacilityBackButton onClick={() => onFacilityChange(null)} />
        <GuildTrainingGroundPanel info={info} onChanged={onChanged} />
      </div>
    );
  }

  if (activeFacility === "exploration_hq") {
    return (
      <div className="space-y-3">
        <FacilityBackButton onClick={() => onFacilityChange(null)} />
        <GuildExplorationPanel canManage={canManage} onChanged={onChanged} />
      </div>
    );
  }

  if (activeFacility === "alchemy_workshop") {
    return (
      <div className="space-y-3">
        <FacilityBackButton onClick={() => onFacilityChange(null)} />
        <GuildAlchemyWorkshopPanel />
      </div>
    );
  }

  if (activeFacility === "dining_hall") {
    return (
      <div className="space-y-3">
        <FacilityBackButton onClick={() => onFacilityChange(null)} />
        <GuildDiningHallPanel />
      </div>
    );
  }

  if (activeFacility === "trade_post") {
    return (
      <div className="space-y-3">
        <FacilityBackButton onClick={() => onFacilityChange(null)} />
        <GuildTradePostPanel />
      </div>
    );
  }

  if (activeFacility === "guild_warehouse") {
    return (
      <div className="space-y-3">
        <FacilityBackButton onClick={() => onFacilityChange(null)} />
        <GuildWarehousePanel />
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
          {rows.map((row) => {
            const next =
              row.count > 0
                ? nextSettlementBuildingUpgrade(row.id, row.level)
                : null;
            return (
              <div
                key={row.id}
                className="flex min-h-[96px] flex-col justify-between rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <GameIcon
                        name={row.iconName}
                        size={18}
                        className={GUILD_FACILITY_ICON_COLORS[row.id]}
                      />
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
                        준비 중
                      </span>
                    </div>
                  )}
                </div>
                {row.count > 0 && (
                  <div className="mt-2 space-y-2">
                    {next && (
                      <GuildFacilityUpgradeFund
                        buildingId={row.id}
                        next={next}
                        progress={info?.facilityUpgradeDonations?.[row.id]}
                        guildGold={guildGold}
                        guildFame={guildFame}
                        canComplete={canManage}
                        completing={upgradingId === row.id}
                        onComplete={() => void upgradeFacility(row.id)}
                        onChanged={onChanged}
                      />
                    )}
                    {!next && (
                      <p className="text-center text-xs font-medium text-emerald-600 dark:text-emerald-300">
                        최대 레벨에 도달했습니다.
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => onFacilityChange(row.id)}
                      className="mx-auto block w-[70%] rounded-md border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
                    >
                      {row.name} {row.actionLabel}
                    </button>
                  </div>
                )}
                {row.count <= 0 && (
                  <p className="mt-2 text-center text-xs text-zinc-500 dark:text-zinc-400">
                    시설 정보를 준비하고 있습니다. 잠시 후 다시 확인해 주세요.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

    </div>
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

function facilityUpgradeErrorText(error?: string): string {
  switch (error) {
    case "no_guild":
      return "소속 길드가 없습니다.";
    case "not_authorized":
      return "시설 업그레이드 권한이 없습니다.";
    case "smithy_required":
    case "building_required":
      return "길드 시설 정보를 찾을 수 없습니다. 잠시 후 다시 시도해 주세요.";
    case "invalid_building":
      return "업그레이드할 수 없는 시설입니다.";
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
