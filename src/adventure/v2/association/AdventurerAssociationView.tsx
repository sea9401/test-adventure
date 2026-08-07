"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ADVENTURER_ASSOCIATION_FACILITY_IDS,
  type AdventurerAssociationFacilityId,
} from "@/adventure/data/v2/adventurerAssociation";
import {
  SETTLEMENT_BUILDINGS,
  alchemyWorkshopUpgradeForLevel,
  diningHallUpgradeForLevel,
  explorationHqUpgradeForLevel,
  guildSmithyUpgradeForLevel,
  settlementBuildingUpgradeSummary,
  tradePostUpgradeForLevel,
  trainingGroundUpgradeForLevel,
  type AnySettlementBuildingUpgradeDef,
  type SettlementResources,
} from "@/adventure/data/v2/settlement";
import { GameIcon } from "@/adventure/v2/GameIcon";
import { GuildAlchemyWorkshopPanel } from "@/adventure/v2/guild/GuildAlchemyWorkshopPanel";
import { GuildDiningHallPanel } from "@/adventure/v2/guild/GuildDiningHallPanel";
import { GuildTradePostPanel } from "@/adventure/v2/guild/GuildTradePostPanel";
import { GuildTrainingGroundPanel } from "@/adventure/v2/guild/GuildTrainingGroundPanel";
import { GuildWorkshopPanel } from "@/adventure/v2/guild/GuildWorkshopPanel";
import { GUILD_FACILITY_ICON_COLORS } from "@/adventure/v2/guild/guildFacilities";
import { PageShell } from "@/components/ui/PageShell";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { SURFACE_ACCENT, SURFACE_CARD } from "@/components/ui/surfaces";
import { AssociationFacilityFund } from "./AssociationFacilityFund";

type FacilityRow = {
  buildingId: AdventurerAssociationFacilityId;
  level: number;
  targetLevel: number | null;
  materials: SettlementResources;
  gold: number;
  nextUpgrade: (AnySettlementBuildingUpgradeDef & {
    associationCost: SettlementResources & { gold?: number };
  }) | null;
};

const DESCRIPTIONS: Record<AdventurerAssociationFacilityId, string> = {
  guild_smithy: "길드 없이도 제작 장비와 대장장이 성장을 이용하는 공공 제작소입니다.",
  training_ground: "모든 모험가가 직업 숙련도 훈련을 받을 수 있는 공공 훈련장입니다.",
  exploration_hq: "서버 전체가 주간 탐사 의뢰와 원정 진행을 함께 준비합니다.",
  alchemy_workshop: "개인 재료로 HP·MP 충전액을 조제하는 공공 연금 공방입니다.",
  dining_hall: "공동 메뉴를 준비하되 식권과 식사 효과는 이용자별로 관리합니다.",
  trade_post: "계약 진행도만 공유하고 교역 토큰과 구매 한도는 개인별로 관리합니다.",
};

export function AdventurerAssociationView({ onBack }: { onBack: () => void }) {
  const [facilities, setFacilities] = useState<FacilityRow[]>([]);
  const [active, setActive] = useState<AdventurerAssociationFacilityId | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/v2/association", { cache: "no-store" });
      const json = (await response.json().catch(() => null)) as {
        ok?: boolean;
        facilities?: FacilityRow[];
      } | null;
      if (!response.ok || !json?.ok) {
        setError("협회 시설 현황을 불러오지 못했습니다.");
        return;
      }
      setFacilities(json.facilities ?? []);
    } catch {
      setError("협회 시설 현황을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (active) {
    return (
      <PageShell spacing="tight">
        <SubViewHeader
          title={associationFacilityName(active)}
          onBack={() => setActive(null)}
        />
        {active === "training_ground" && (
          <GuildTrainingGroundPanel
            info={{ ok: true, settlementBuildings: { training_ground: 1 } }}
            localTrainingGround
            endpoint="/api/v2/guild/training-ground?scope=association"
          />
        )}
        {active === "guild_smithy" && (
          <GuildWorkshopPanel
            info={{ ok: true, hasGuildSmithy: true, settlementBuildings: { guild_smithy: 1 } }}
            localSmithy
            association
          />
        )}
        {active === "alchemy_workshop" && (
          <GuildAlchemyWorkshopPanel
            endpoint="/api/v2/guild/alchemy-workshop?scope=association"
            title="협회 연금 공방"
          />
        )}
        {active === "dining_hall" && (
          <GuildDiningHallPanel
            endpoint="/api/v2/association/dining-hall"
            title="협회 식당"
            source="association"
          />
        )}
        {active === "trade_post" && (
          <GuildTradePostPanel
            endpoint="/api/v2/association/trade-post"
            title="협회 교역소"
            sharedTokens={false}
          />
        )}
        {active === "exploration_hq" && (
          <section className={`${SURFACE_CARD} p-4 text-sm`}>
            이 시설의 공공 이용 화면을 준비하고 있습니다.
          </section>
        )}
      </PageShell>
    );
  }

  const byId = new Map(facilities.map((row) => [row.buildingId, row]));
  return (
    <PageShell spacing="tight">
      <SubViewHeader title="모험가 협회" onBack={onBack} />
      <section className={`${SURFACE_ACCENT} space-y-1 p-4 text-sm`}>
        <h2 className="font-bold">모든 모험가를 위한 공공시설</h2>
        <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
          시설은 모두 Lv.1부터 개방됩니다. 누구나 재료와 골드를 기부할 수 있으며,
          목표를 채우는 즉시 자동으로 승급합니다. 길드 창고는 협회 시설에 포함되지 않습니다.
        </p>
        <p className="text-xs text-amber-700 dark:text-amber-300">
          각 시설의 주간 보상은 길드 또는 협회 중 먼저 이용한 한쪽으로 고정됩니다.
        </p>
      </section>
      {loading && <p className="text-sm text-zinc-500">협회 시설 확인 중…</p>}
      {error && <p className="text-sm text-red-600 dark:text-red-300">{error}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {ADVENTURER_ASSOCIATION_FACILITY_IDS.map((buildingId) => {
          const row = byId.get(buildingId) ?? {
            buildingId,
            level: 1,
            targetLevel: 2,
            materials: {},
            gold: 0,
            nextUpgrade: null,
          };
          const definition = SETTLEMENT_BUILDINGS[buildingId];
          return (
            <section key={buildingId} className={`${SURFACE_CARD} space-y-3 p-3`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <GameIcon
                      name={definition.iconName}
                      size={20}
                      className={GUILD_FACILITY_ICON_COLORS[buildingId]}
                    />
                    <h3 className="font-bold">{associationFacilityName(buildingId)}</h3>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                    {DESCRIPTIONS[buildingId]}
                  </p>
                </div>
                <span className="shrink-0 rounded bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                  Lv.{row.level}
                </span>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-300">
                {settlementBuildingUpgradeSummary(
                  buildingId,
                  currentFacilityUpgrade(buildingId, row.level),
                )}
              </p>
              {row.nextUpgrade ? (
                <AssociationFacilityFund
                  buildingId={buildingId}
                  progress={row}
                  next={row.nextUpgrade}
                  onChanged={() => void load()}
                />
              ) : row.level >= 5 ? (
                <p className="text-center text-xs font-semibold text-emerald-600">최고 레벨</p>
              ) : null}
              <button
                type="button"
                onClick={() => setActive(buildingId)}
                className="w-full rounded-md bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
              >
                시설 이용
              </button>
            </section>
          );
        })}
      </div>
    </PageShell>
  );
}

function associationFacilityName(id: AdventurerAssociationFacilityId): string {
  if (id === "guild_smithy") return "협회 제작소";
  if (id === "dining_hall") return "협회 식당";
  if (id === "trade_post") return "협회 교역소";
  return SETTLEMENT_BUILDINGS[id].name;
}

function currentFacilityUpgrade(
  id: AdventurerAssociationFacilityId,
  level: number,
): AnySettlementBuildingUpgradeDef {
  if (id === "guild_smithy") return guildSmithyUpgradeForLevel(level);
  if (id === "training_ground") return trainingGroundUpgradeForLevel(level);
  if (id === "exploration_hq") return explorationHqUpgradeForLevel(level);
  if (id === "alchemy_workshop") return alchemyWorkshopUpgradeForLevel(level);
  if (id === "dining_hall") return diningHallUpgradeForLevel(level);
  return tradePostUpgradeForLevel(level);
}
