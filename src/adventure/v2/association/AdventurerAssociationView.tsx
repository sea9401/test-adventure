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
import { EntryList, EntryRow } from "@/components/ui/EntryList";
import { PageShell } from "@/components/ui/PageShell";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { SURFACE_CARD } from "@/components/ui/surfaces";
import { TwoPane } from "@/components/ui/TwoPane";
import { useMediaQuery } from "@/lib/useMediaQuery";
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
  training_ground: "무소속 모험가가 직업 숙련도 훈련을 받을 수 있는 공공 훈련장입니다.",
  exploration_hq: "서버 전체가 주간 탐사 의뢰와 원정 진행을 함께 준비합니다.",
  alchemy_workshop: "개인 재료로 HP·MP 충전액을 조제하는 공공 연금 공방입니다.",
  dining_hall: "공동 메뉴를 준비하되 식권과 식사 효과는 이용자별로 관리합니다.",
  trade_post: "계약 진행도만 공유하고 교역 토큰과 구매 한도는 개인별로 관리합니다.",
};

export function AdventurerAssociationView({ onBack }: { onBack: () => void }) {
  const [facilities, setFacilities] = useState<FacilityRow[]>([]);
  const [active, setActive] = useState<AdventurerAssociationFacilityId | null>(null);
  const [detailView, setDetailView] = useState<"use" | "fund">("use");
  const wide = useMediaQuery("(min-width: 1024px)");
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

  const byId = new Map(facilities.map((row) => [row.buildingId, row]));
  const rowFor = (buildingId: AdventurerAssociationFacilityId): FacilityRow =>
    byId.get(buildingId) ?? {
      buildingId,
      level: 1,
      targetLevel: 2,
      materials: {},
      gold: 0,
      nextUpgrade: null,
    };

  const openFacility = (buildingId: AdventurerAssociationFacilityId) => {
    setDetailView("use");
    setActive(buildingId);
  };
  // PC(1024px 이상)는 목록과 상세를 나란히 두고, 처음에는 첫 시설을 고른 상태로 연다.
  const shown = active ?? (wide ? ADVENTURER_ASSOCIATION_FACILITY_IDS[0] : null);

  const help = (
    <>
      <p className="font-semibold">무소속 모험가를 위한 공공시설</p>
      <p>
        시설은 모두 Lv.1부터 개방됩니다. 길드에 가입하지 않은 모험가가 재료와 골드를 기부할 수
        있으며, 목표를 채우는 즉시 자동으로 승급합니다. 길드 창고는 협회 시설에 포함되지 않습니다.
      </p>
      <p>각 시설의 주간 보상은 길드 또는 협회 중 먼저 이용한 한쪽으로 고정됩니다.</p>
    </>
  );

  const list = (
    <EntryList>
      {ADVENTURER_ASSOCIATION_FACILITY_IDS.map((buildingId) => (
        <EntryRow
          key={buildingId}
          icon={
            <GameIcon
              name={SETTLEMENT_BUILDINGS[buildingId].iconName}
              size={26}
              className={GUILD_FACILITY_ICON_COLORS[buildingId]}
            />
          }
          title={associationFacilityName(buildingId)}
          description={associationFacilityRowDescription(rowFor(buildingId))}
          selected={wide && shown === buildingId}
          onClick={() => openFacility(buildingId)}
        />
      ))}
    </EntryList>
  );

  if (wide && shown) {
    return (
      <PageShell spacing="tight">
        <SubViewHeader title="모험가 협회" onBack={onBack} help={help} />
        {loading && <p className="text-sm text-zinc-500">협회 시설 확인 중…</p>}
        {error && <p className="text-sm text-red-600 dark:text-red-300">{error}</p>}
        <TwoPane aside={list}>
          <FacilityDetail
            title={associationFacilityName(shown)}
            buildingId={shown}
            row={rowFor(shown)}
            view={detailView}
            onViewChange={setDetailView}
            onChanged={() => void load()}
          />
        </TwoPane>
      </PageShell>
    );
  }

  if (shown) {
    return (
      <PageShell spacing="tight">
        <SubViewHeader
          title={associationFacilityName(shown)}
          onBack={() => setActive(null)}
        />
        <FacilityDetail
          buildingId={shown}
          row={rowFor(shown)}
          view={detailView}
          onViewChange={setDetailView}
          onChanged={() => void load()}
        />
      </PageShell>
    );
  }

  return (
    <PageShell spacing="tight">
      <SubViewHeader title="모험가 협회" onBack={onBack} help={help} />
      {loading && <p className="text-sm text-zinc-500">협회 시설 확인 중…</p>}
      {error && <p className="text-sm text-red-600 dark:text-red-300">{error}</p>}
      {list}
    </PageShell>
  );
}

// 시설 상세 — 현재 효과 요약과 이용 / 공동 기부 전환.
function FacilityDetail({
  title,
  buildingId,
  row,
  view,
  onViewChange,
  onChanged,
}: {
  // PC 2단처럼 화면 머리에 시설 이름이 없을 때 카드 안에 이름을 보여 준다.
  title?: string;
  buildingId: AdventurerAssociationFacilityId;
  row: FacilityRow;
  view: "use" | "fund";
  onViewChange: (view: "use" | "fund") => void;
  onChanged: () => void;
}) {
  return (
    <>
      <section className={`${SURFACE_CARD} space-y-1 p-4 text-sm`}>
        <div className="flex items-center justify-between gap-2">
          {title ? (
            <h2 className="ui-heading text-base font-bold">
              {title} <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">Lv.{row.level}</span>
            </h2>
          ) : (
            <span className="font-bold">Lv.{row.level}</span>
          )}
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {settlementBuildingUpgradeSummary(buildingId, currentFacilityUpgrade(buildingId, row.level))}
          </span>
        </div>
        <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          {DESCRIPTIONS[buildingId]}
        </p>
      </section>
      <SegmentedControl
        options={[
          { key: "use", label: "이용" },
          {
            key: "fund",
            label: row.nextUpgrade ? `공동 기부 (Lv.${row.nextUpgrade.level})` : "공동 기부",
          },
        ]}
        value={view}
        onChange={onViewChange}
        ariaLabel="시설 보기"
      />
      {view === "fund" ? (
        row.nextUpgrade ? (
          <AssociationFacilityFund
            key={buildingId}
            buildingId={buildingId}
            progress={row}
            next={row.nextUpgrade}
            onChanged={onChanged}
          />
        ) : (
          <p className={`${SURFACE_CARD} p-4 text-center text-sm font-semibold text-emerald-700 dark:text-emerald-300`}>
            최고 레벨입니다.
          </p>
        )
      ) : (
        <>
          {buildingId === "training_ground" && (
            <GuildTrainingGroundPanel
              info={{ ok: true, settlementBuildings: { training_ground: 1 } }}
              localTrainingGround
              endpoint="/api/v2/guild/training-ground?scope=association"
            />
          )}
          {buildingId === "guild_smithy" && (
            <GuildWorkshopPanel
              info={{ ok: true, hasGuildSmithy: true, settlementBuildings: { guild_smithy: 1 } }}
              localSmithy
              association
            />
          )}
          {buildingId === "alchemy_workshop" && (
            <GuildAlchemyWorkshopPanel
              endpoint="/api/v2/guild/alchemy-workshop?scope=association"
              title="협회 연금 공방"
            />
          )}
          {buildingId === "dining_hall" && (
            <GuildDiningHallPanel
              endpoint="/api/v2/association/dining-hall"
              title="협회 식당"
              source="association"
            />
          )}
          {buildingId === "trade_post" && (
            <GuildTradePostPanel
              endpoint="/api/v2/association/trade-post"
              title="협회 교역소"
              sharedTokens={false}
            />
          )}
          {buildingId === "exploration_hq" && (
            <section className={`${SURFACE_CARD} p-4 text-sm`}>
              이 시설의 공공 이용 화면을 준비하고 있습니다.
            </section>
          )}
        </>
      )}
    </>
  );
}

// 목록 행 설명 — 레벨과 지금 적용 중인 효과.
export function associationFacilityRowDescription(row: {
  buildingId: AdventurerAssociationFacilityId;
  level: number;
}): string {
  return `Lv.${row.level} · ${settlementBuildingUpgradeSummary(
    row.buildingId,
    currentFacilityUpgrade(row.buildingId, row.level),
  )}`;
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
