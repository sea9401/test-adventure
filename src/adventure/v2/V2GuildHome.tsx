"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TabBar } from "@/components/ui/TabBar";
import { HeaderPanel } from "@/components/ui/HeaderPanel";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { GuildBrowsePanel } from "@/adventure/guild/GuildBrowsePanel";
import type { GuildActivity } from "./GuildActivityList";
import { GuildFoundCard } from "./GuildFoundCard";
import { NoticeBanner } from "./guild/NoticeBanner";
import { GuildInfoPanel } from "./guild/GuildInfoPanel";
import { GuildMembersPanel } from "./guild/GuildMembersPanel";
import { GuildManagePanel } from "./guild/GuildManagePanel";
import { GuildFacilitiesPanel } from "./guild/GuildOutpostsPanel";
import { isGuildFacilityId } from "./guild/guildFacilities";
import {
  type GuildInfoResponse,
  type GuildSubTab,
  type Notice,
  type PendingRequest,
  type StateResponse,
} from "./guild/guildShared";
import { useSystemToast } from "./RewardToastProvider";

// 길드 탭 — sub-tab nav 분리 (info / members / facilities / manage).
// 관리(manage) 탭 = 마스터/관리자(manager) 전용 — 멤버 초대·가입 신청·길드 연구·직책.
// 훈련장·제작소 등 길드 시설은 상위 탭을 늘리지 않고 facilities 내부에서 진입한다.
// 각 탭의 렌더·로컬 상태/핸들러는 ./guild/*Panel 로 추출. 이 파일 = 공유 상태 + 탭 전환 조정자.

const BASE_SUB_TABS: { key: GuildSubTab; label: string }[] = [
  { key: "info", label: "길드 정보" },
  { key: "members", label: "길드원" },
  { key: "facilities", label: "시설" },
];

type GuildSubTabDef = { key: GuildSubTab; label: string; badge?: string | number };

export function V2GuildHome({
  viewerGuildId,
  onGuildChanged,
}: {
  viewerGuildId: number | null;
  // 길드 소속이 바뀌면(창단 등) 부모의 viewerGuildId 를 다시 받아오게 알린다.
  onGuildChanged?: () => void;
}) {
  const searchParams = useSearchParams();
  const [state, setState] = useState<StateResponse | null>(null);
  const [info, setInfo] = useState<GuildInfoResponse | null>(null);
  const [activity, setActivity] = useState<GuildActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [acting, setActing] = useState(false);
  const { notifySystem } = useSystemToast();
  const requestedTab = guildSubTabFromParam(searchParams.get("tab"));
  const facilityParam = searchParams.get("facility");
  const requestedFacility = isGuildFacilityId(facilityParam)
    ? facilityParam
    : null;
  const activeFacility =
    requestedFacility != null &&
    (info?.settlementBuildings?.[requestedFacility] ?? 0) > 0
      ? requestedFacility
      : null;

  const navigateGuild = useCallback(
    (tab: GuildSubTab, facility?: string | null, replace = false) => {
      const href = guildHref(tab, facility);
      if (replace) {
        window.history.replaceState(null, "", href);
      } else {
        window.history.pushState(null, "", href);
      }
    },
    [],
  );

  useEffect(() => {
    if (!notice) return;
    notifySystem(notice.text, notice.kind === "ok" ? "success" : "error");
  }, [notice, notifySystem]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [stateRes, infoRes, actRes] = await Promise.all([
        fetch("/api/v2/me/state").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/v2/me/guild/info").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/v2/guild/activity").then((r) => (r.ok ? r.json() : null)),
      ]);
      setState(stateRes as StateResponse | null);
      setInfo(infoRes as GuildInfoResponse | null);
      setActivity(
        (actRes as { activity?: GuildActivity[] } | null)?.activity ?? [],
      );
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 1회 fetch(refresh 가 state 시드)
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (loading || !info || facilityParam == null) return;
    const isAvailable =
      requestedTab === "facilities" &&
      requestedFacility != null &&
      (info.settlementBuildings?.[requestedFacility] ?? 0) > 0;
    if (!isAvailable) {
      navigateGuild("facilities", null, true);
    }
  }, [
    facilityParam,
    info,
    loading,
    navigateGuild,
    requestedFacility,
    requestedTab,
  ]);

  // 길드 id — 방금 창단했으면 부모 prop(viewerGuildId)이 아직 stale 일 수 있어
  // 자체 fetch 한 state.guild.id 를 우선한다(없으면 prop 폴백).
  const guildId = state?.guild?.id ?? viewerGuildId;

  // 무소속이면 창단 + 둘러보기를 노출. 길드원/시설 등 모든 sub-tab 의 prerequisite 가 길드.
  if (!loading && !state?.guild) {
    return (
      <main className="mx-auto max-w-[720px] space-y-3 p-6 text-zinc-900 dark:text-zinc-100">
        <SubViewHeader title="길드" />

        {notice && <NoticeBanner notice={notice} />}

        <GuildFoundCard
          onCreated={() => {
            refresh();
            onGuildChanged?.();
          }}
        />

        <div className="flex items-center gap-2 pt-1 text-xs text-zinc-400 dark:text-zinc-500">
          <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
          또는 기존 길드에 가입
          <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
        </div>

        <GuildBrowsePanel
          busy={false}
          leaveCooldownUntil={info?.leaveCooldownUntil ?? null}
          onToast={(text) => setNotice({ kind: "ok", text })}
          onError={(text) => setNotice({ kind: "err", text })}
        />
      </main>
    );
  }

  const isMaster = info?.isMaster ?? false;
  const isManager = info?.isManager ?? false;
  const canManage = isMaster || isManager;
  const pendingRequests: PendingRequest[] = info?.pendingRequests ?? [];
  // 마스터/관리자에게만 "관리" 탭 추가(가입 신청 대기 건수 뱃지) — 맨 뒤에 배치.
  const subTabs: GuildSubTabDef[] = canManage
    ? [
        ...BASE_SUB_TABS,
        {
          key: "manage",
          label:
            pendingRequests.length > 0
              ? `관리 (${pendingRequests.length})`
              : "관리",
        },
      ]
    : BASE_SUB_TABS;
  // 선택된 탭이 목록에서 사라지면(예: 마스터 해제) "정보"로 폴백 — 빈 화면 방지.
  const activeTab: GuildSubTab = subTabs.some((t) => t.key === requestedTab)
    ? requestedTab
    : "info";

  return (
    <main className="mx-auto max-w-[720px] space-y-3 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader title={state?.guild?.name ?? "길드"} />

      <HeaderPanel className="py-2">
        <TabBar
          tabs={subTabs}
          active={activeTab}
          onChange={(tab) => navigateGuild(tab)}
          ariaLabel="길드 하위 탭"
          size="sm"
          variant="highlight"
          scrollable
        />
      </HeaderPanel>

      {activeTab === "info" && (
        <GuildInfoPanel
          info={info}
          loading={loading}
          activity={activity}
          onRefresh={refresh}
        />
      )}

      {activeTab === "members" && (
        <GuildMembersPanel
          info={info}
          loading={loading}
          isMaster={isMaster}
          acting={acting}
          setActing={setActing}
          notice={notice}
          setNotice={setNotice}
          onRefresh={refresh}
          onGuildChanged={onGuildChanged}
        />
      )}

      {activeTab === "manage" && canManage && (
        <GuildManagePanel
          info={info}
          guildId={guildId}
          stateGuildName={state?.guild?.name}
          acting={acting}
          setActing={setActing}
          notice={notice}
          setNotice={setNotice}
          onRefresh={refresh}
          isMaster={isMaster}
          pendingRequests={pendingRequests}
          loading={loading}
          onGuildChanged={onGuildChanged}
        />
      )}

      {activeTab === "facilities" && (
        <GuildFacilitiesPanel
          guildId={guildId}
          info={info}
          canManage={canManage}
          activeFacility={activeFacility}
          onFacilityChange={(facility) =>
            navigateGuild("facilities", facility)
          }
          onChanged={refresh}
          onNotice={setNotice}
        />
      )}
    </main>
  );
}

function guildSubTabFromParam(value: string | null): GuildSubTab {
  if (
    value === "members" ||
    value === "facilities" ||
    value === "manage"
  ) {
    return value;
  }
  return "info";
}

function guildHref(tab: GuildSubTab, facility?: string | null): string {
  const params = new URLSearchParams();
  if (tab !== "info") params.set("tab", tab);
  if (tab === "facilities" && facility) params.set("facility", facility);
  const query = params.toString();
  return query ? `/guild?${query}` : "/guild";
}
