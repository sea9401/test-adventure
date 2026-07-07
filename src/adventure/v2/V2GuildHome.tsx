"use client";

import { useCallback, useEffect, useState } from "react";
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
import { GuildWorkshopPanel } from "./guild/GuildWorkshopPanel";
import { GuildTrainingGroundPanel } from "./guild/GuildTrainingGroundPanel";
import { fetchGuildTrainingClaimableCount } from "./guild/trainingGroundClient";
import {
  type GuildInfoResponse,
  type GuildSubTab,
  type Notice,
  type PendingRequest,
  type StateResponse,
} from "./guild/guildShared";
import { useSystemToast } from "./RewardToastProvider";

// 길드 탭 — sub-tab nav 분리 (info / members / facilities / training / manage).
// 관리(manage) 탭 = 마스터/관리자(manager) 전용 — 멤버 초대·가입 신청·길드 연구·직책.
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
  const [subTab, setSubTab] = useState<GuildSubTab>("info");
  const [state, setState] = useState<StateResponse | null>(null);
  const [info, setInfo] = useState<GuildInfoResponse | null>(null);
  const [activity, setActivity] = useState<GuildActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [acting, setActing] = useState(false);
  const [trainingClaimableCount, setTrainingClaimableCount] = useState<
    number | null
  >(null);
  const { notifySystem } = useSystemToast();

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
      const infoJson = infoRes as GuildInfoResponse | null;
      const hasTraining =
        infoJson?.hasTrainingGround ||
        (infoJson?.settlementBuildings?.training_ground ?? 0) > 0;
      setTrainingClaimableCount(
        hasTraining ? await fetchGuildTrainingClaimableCount() : null,
      );
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 1회 fetch(refresh 가 state 시드)
    refresh();
  }, [refresh]);

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
  const trainingBadge =
    trainingClaimableCount != null && trainingClaimableCount > 0
      ? trainingClaimableCount
      : undefined;
  const withTraining: GuildSubTabDef[] =
    info?.hasTrainingGround || (info?.settlementBuildings?.training_ground ?? 0) > 0
      ? [...BASE_SUB_TABS, { key: "training", label: "훈련장", badge: trainingBadge }]
      : BASE_SUB_TABS;
  const withWorkshop: GuildSubTabDef[] =
    info?.hasGuildSmithy || (info?.settlementBuildings?.guild_smithy ?? 0) > 0
      ? [...withTraining, { key: "workshop", label: "대장간" }]
      : withTraining;
  // 마스터/관리자에게만 "관리" 탭 추가(가입 신청 대기 건수 뱃지) — 맨 뒤에 배치.
  const subTabs: GuildSubTabDef[] = canManage
    ? [
        ...withWorkshop,
        {
          key: "manage",
          label:
            pendingRequests.length > 0
              ? `관리 (${pendingRequests.length})`
              : "관리",
        },
      ]
    : withWorkshop;
  // 선택된 탭이 목록에서 사라지면(예: 마스터 해제) "정보"로 폴백 — 빈 화면 방지.
  const activeTab: GuildSubTab = subTabs.some((t) => t.key === subTab)
    ? subTab
    : "info";

  return (
    <main className="mx-auto max-w-[720px] space-y-3 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader title={state?.guild?.name ?? "길드"} />

      <HeaderPanel className="py-2">
        <TabBar
          tabs={subTabs}
          active={activeTab}
          onChange={setSubTab}
          ariaLabel="길드 하위 탭"
          size="sm"
          variant="highlight"
          scrollable
        />
      </HeaderPanel>

      {activeTab === "training" && (
        <GuildTrainingGroundPanel info={info} onChanged={refresh} />
      )}

      {activeTab === "workshop" && <GuildWorkshopPanel info={info} />}

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
          onOpenFacility={(id) => {
            if (id === "guild_smithy") setSubTab("workshop");
            else if (id === "training_ground") setSubTab("training");
          }}
        />
      )}
    </main>
  );
}
