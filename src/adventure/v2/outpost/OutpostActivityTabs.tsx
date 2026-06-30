"use client";

import { useEffect, useMemo, useState } from "react";
import { HeaderPanel } from "@/components/ui/HeaderPanel";
import { TabBar } from "@/components/ui/TabBar";
import { V2_SETTLEMENT_WARFARE } from "@/adventure/data/v2/settlementWarfareConfig";
import { settlementBuildingIdOf } from "@/adventure/data/v2/settlement";
import { GuildWorkshopPanel } from "../guild/GuildWorkshopPanel";
import { OutpostAttackLog } from "../OutpostAttackLog";
import { V2VillagePanel } from "../V2VillagePanel";
import DefendPanel from "../DefendPanel";

// 내 거점 활동 탭 — 마을 / 대장간 / (수비) / 최근 공격 기록.
export type ActivityTab =
  | "smithy"
  | "attacks"
  | "manage"
  | "defend";

type ActivityTabDef = { key: ActivityTab; label: string };

type VillageSummary = {
  outpostId: string;
  buildings?: Record<string, unknown>;
};

function hasSmithyBuilding(village: VillageSummary | undefined): boolean {
  return Object.values(village?.buildings ?? {}).some(
    (raw) => settlementBuildingIdOf(raw) === "guild_smithy",
  );
}

// 내 거점/정착지(소유) 탭 패널 — 탭 바 + 활성 탭 콘텐츠. 탭 상태는 코디네이터(OutpostView)가 보유.
export function OutpostActivityTabs({
  outpostId,
  activityTab,
  onTabChange,
  canManageSettlement,
  attackLogReload,
}: {
  outpostId: string;
  activityTab: ActivityTab;
  onTabChange: (tab: ActivityTab) => void;
  canManageSettlement: boolean;
  attackLogReload: number;
}) {
  const [hasLocalSmithy, setHasLocalSmithy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/v2/outpost/village?outpostId=${encodeURIComponent(outpostId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { ok?: boolean; villages?: VillageSummary[] } | null) => {
        if (!alive) return;
        const village = (j?.villages ?? []).find((v) => v.outpostId === outpostId);
        setHasLocalSmithy(hasSmithyBuilding(village));
      })
      .catch(() => {
        if (alive) setHasLocalSmithy(false);
      });
    return () => {
      alive = false;
    };
  }, [outpostId]);

  const tabs = useMemo<ActivityTabDef[]>(
    () => [
      { key: "manage", label: "마을" },
      ...(hasLocalSmithy
        ? [{ key: "smithy" as const, label: "대장간" }]
        : []),
      ...(V2_SETTLEMENT_WARFARE
        ? [{ key: "defend" as const, label: "수비" }]
        : []),
      { key: "attacks", label: "최근 공격 기록" },
    ],
    [hasLocalSmithy],
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
        <GuildWorkshopPanel info={null} localSmithy />
      )}
      {activityTab === "defend" && V2_SETTLEMENT_WARFARE && (
        <DefendPanel outpostId={outpostId} />
      )}
      {activityTab === "attacks" && (
        <OutpostAttackLog outpostId={outpostId} reloadKey={attackLogReload} />
      )}
      {activityTab === "manage" && (
        <V2VillagePanel
          outpostId={outpostId}
          canManageActions={canManageSettlement}
        />
      )}
    </>
  );
}
