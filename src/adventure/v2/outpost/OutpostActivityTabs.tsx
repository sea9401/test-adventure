"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { HeaderPanel } from "@/components/ui/HeaderPanel";
import { TabBar } from "@/components/ui/TabBar";
import { V2_SETTLEMENT_WARFARE } from "@/adventure/data/v2/settlementWarfareConfig";
import { settlementBuildingIdOf } from "@/adventure/data/v2/settlement";
import type { SettlementBuildingId } from "@/adventure/data/v2/settlement";
import { GuildTrainingGroundPanel } from "../guild/GuildTrainingGroundPanel";
import { fetchGuildTrainingClaimableCount } from "../guild/trainingGroundClient";
import { GuildWorkshopPanel } from "../guild/GuildWorkshopPanel";
import { OutpostAttackLog } from "../OutpostAttackLog";
import { V2VillagePanel } from "../V2VillagePanel";
import DefendPanel from "../DefendPanel";

// 내 거점 활동 탭 — 마을 / 대장간 / (수비) / 최근 공격 기록.
export type ActivityTab =
  | "smithy"
  | "training"
  | "attacks"
  | "manage"
  | "defend";

type ActivityTabDef = { key: ActivityTab; label: string; badge?: string | number };

type VillageSummary = {
  outpostId: string;
  buildings?: Record<string, unknown>;
};

function hasBuilding(
  village: VillageSummary | undefined,
  buildingId: SettlementBuildingId,
): boolean {
  return Object.values(village?.buildings ?? {}).some(
    (raw) => settlementBuildingIdOf(raw) === buildingId,
  );
}

// 내 거점/정착지(소유) 탭 패널 — 탭 바 + 활성 탭 콘텐츠. 탭 상태는 코디네이터(OutpostView)가 보유.
export function OutpostActivityTabs({
  outpostId,
  activityTab,
  onTabChange,
  canManageSettlement,
  showManageTab = true,
  canDefendSettlement = true,
  attackLogReload,
}: {
  outpostId: string;
  activityTab: ActivityTab;
  onTabChange: (tab: ActivityTab) => void;
  canManageSettlement: boolean;
  showManageTab?: boolean;
  canDefendSettlement?: boolean;
  attackLogReload: number;
}) {
  const [hasLocalSmithy, setHasLocalSmithy] = useState(false);
  const [hasLocalTrainingGround, setHasLocalTrainingGround] = useState(false);
  const [trainingClaimableCount, setTrainingClaimableCount] = useState<
    number | null
  >(null);

  const loadTrainingAvailability = useCallback(async () => {
    setTrainingClaimableCount(await fetchGuildTrainingClaimableCount(outpostId));
  }, [outpostId]);

  useEffect(() => {
    let alive = true;
    fetch(`/api/v2/outpost/village?outpostId=${encodeURIComponent(outpostId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { ok?: boolean; villages?: VillageSummary[] } | null) => {
        if (!alive) return;
        const village = (j?.villages ?? []).find((v) => v.outpostId === outpostId);
        setHasLocalSmithy(hasBuilding(village, "guild_smithy"));
        setHasLocalTrainingGround(hasBuilding(village, "training_ground"));
      })
      .catch(() => {
        if (alive) {
          setHasLocalSmithy(false);
          setHasLocalTrainingGround(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [outpostId]);

  useEffect(() => {
    let alive = true;
    if (!hasLocalTrainingGround) {
      queueMicrotask(() => {
        if (alive) setTrainingClaimableCount(null);
      });
    } else {
      queueMicrotask(() => {
        if (alive) void loadTrainingAvailability();
      });
    }
    return () => {
      alive = false;
    };
  }, [hasLocalTrainingGround, loadTrainingAvailability]);

  const tabs = useMemo<ActivityTabDef[]>(
    () => [
      ...(showManageTab ? [{ key: "manage" as const, label: "마을" }] : []),
      ...(hasLocalSmithy
        ? [{ key: "smithy" as const, label: "대장간" }]
        : []),
      ...(hasLocalTrainingGround
        ? [
            {
              key: "training" as const,
              label: "훈련장",
              badge:
                trainingClaimableCount != null && trainingClaimableCount > 0
                  ? trainingClaimableCount
                  : undefined,
            },
          ]
        : []),
      ...(V2_SETTLEMENT_WARFARE && canDefendSettlement
        ? [{ key: "defend" as const, label: "수비" }]
        : []),
      { key: "attacks", label: "최근 공격 기록" },
    ],
    [
      hasLocalSmithy,
      hasLocalTrainingGround,
      showManageTab,
      trainingClaimableCount,
      canDefendSettlement,
    ],
  );

  useEffect(() => {
    if (!tabs.some((tab) => tab.key === activityTab)) {
      onTabChange(tabs[0]?.key ?? "attacks");
    }
  }, [activityTab, onTabChange, tabs]);

  return (
    <>
      <HeaderPanel className="py-2">
        <TabBar
          tabs={tabs}
          active={activityTab}
          onChange={(k) => onTabChange(k as ActivityTab)}
          ariaLabel="거점 활동 탭"
          size="sm"
          variant="highlight"
          className="war-tab-rail"
        />
      </HeaderPanel>
      {activityTab === "smithy" && hasLocalSmithy && (
        <GuildWorkshopPanel info={null} localSmithy outpostId={outpostId} />
      )}
      {activityTab === "training" && hasLocalTrainingGround && (
        <GuildTrainingGroundPanel
          info={null}
          localTrainingGround
          outpostId={outpostId}
          onChanged={loadTrainingAvailability}
        />
      )}
      {activityTab === "defend" &&
        V2_SETTLEMENT_WARFARE &&
        canDefendSettlement && <DefendPanel outpostId={outpostId} />}
      {activityTab === "attacks" && (
        <OutpostAttackLog outpostId={outpostId} reloadKey={attackLogReload} />
      )}
      {activityTab === "manage" && showManageTab && (
        <V2VillagePanel
          outpostId={outpostId}
          canManageActions={canManageSettlement}
        />
      )}
    </>
  );
}
