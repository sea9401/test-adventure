"use client";

import { useCallback, useEffect, useState } from "react";
import { TabBar } from "@/components/ui/TabBar";
import { HeaderPanel } from "@/components/ui/HeaderPanel";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { OUTPOSTS } from "@/adventure/data/v2/outposts";
import { tileOutpostId } from "@/adventure/data/v2/tileWarfare";
import type { Outpost } from "@/adventure/data/v2/types";
import { GuildBrowsePanel } from "@/adventure/guild/GuildBrowsePanel";
import HonorShopPanel from "@/adventure/v2/HonorShopPanel";
import { V2_SETTLEMENT_WARFARE } from "@/adventure/data/v2/settlementWarfareConfig";
import type { GuildActivity } from "./GuildActivityList";
import { GuildFoundCard } from "./GuildFoundCard";
import { NoticeBanner } from "./guild/NoticeBanner";
import { GuildInfoPanel } from "./guild/GuildInfoPanel";
import { GuildMembersPanel } from "./guild/GuildMembersPanel";
import { GuildManagePanel } from "./guild/GuildManagePanel";
import { GuildOutpostsPanel } from "./guild/GuildOutpostsPanel";
import { GuildTrainingGroundPanel } from "./guild/GuildTrainingGroundPanel";
import { fetchGuildTrainingClaimableCount } from "./guild/trainingGroundClient";
import {
  TYPE_LABEL,
  settleTierLabel,
  type GuildInfoResponse,
  type GuildSubTab,
  type Notice,
  type Occupation,
  type PendingRequest,
  type PolicyTarget,
  type StateResponse,
  type TileSettlementRow,
} from "./guild/guildShared";

// 길드 탭 — sub-tab nav 분리 (info / members / manage / outposts).
// 관리(manage) 탭 = 마스터/관리자(manager) 전용 — 멤버 초대·가입 신청·거점 정책/세율·직책.
// 각 탭의 렌더·로컬 상태/핸들러는 ./guild/*Panel 로 추출(거동 불변). 이 파일 = 공유 상태 + 탭 전환 조정자.

const BASE_SUB_TABS: { key: GuildSubTab; label: string }[] = [
  { key: "info", label: "길드 정보" },
  { key: "members", label: "길드원" },
  { key: "outposts", label: "영지" },
];

type GuildSubTabDef = { key: GuildSubTab; label: string; badge?: string | number };

export function V2GuildHome({
  viewerGuildId,
  viewerUserId,
  occupations,
  onGuildChanged,
  onOccupationsChanged,
}: {
  viewerGuildId: number | null;
  // 현재 유저 id — 거점 정책 탭의 LordPanel 영주 본인(세금 수확) 판정용.
  viewerUserId: string | null;
  occupations: Occupation[];
  // 길드 소속이 바뀌면(창단 등) 부모의 viewerGuildId 를 다시 받아오게 알린다.
  onGuildChanged?: () => void;
  // 관리탭에서 거점 정책/세율 저장 후 부모 occupations 재조회.
  onOccupationsChanged?: () => void;
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

  // 보유 거점.
  const ownedOutposts: Outpost[] =
    guildId != null
      ? OUTPOSTS.filter((o) =>
          occupations.some(
            (occ) =>
              occ.outpostId === o.id && occ.occupiedByGuildId === guildId,
          ),
        )
      : [];
  const occByOutpost = new Map(occupations.map((o) => [o.outpostId, o]));

  // 우리 길드 영지 = 길드원이 세운 자유 타일 정착지(소유자→현재 길드 귀속은 /me/state 가 파생).
  const guildSettlements: TileSettlementRow[] =
    guildId != null
      ? (state?.tileSettlements ?? []).filter((s) => s.guildId === guildId)
      : [];
  const memberNameById = new Map(
    (info?.members ?? []).map((m) => [m.userId, m.name]),
  );

  // 거점 정책 탭 대상 — 길드 타일 정착지 + 카탈로그 점령 거점(영주/정책·세율 일원 관리).
  const policyTargets: PolicyTarget[] = [
    ...guildSettlements.map((s) => {
      const sid = tileOutpostId(s.col, s.row);
      return {
        outpostId: sid,
        title: `${s.name ?? "개척 정착지"} (${settleTierLabel(s.tier)})`,
        occ: occByOutpost.get(sid),
      };
    }),
    ...ownedOutposts.map((o) => {
      const occ = occByOutpost.get(o.id);
      return {
        outpostId: o.id,
        title: `${occ?.villageName?.trim() || o.name} (${TYPE_LABEL[o.type]})`,
        occ,
      };
    }),
  ];

  // 무소속이면 창단 + 둘러보기를 노출. 점령/길드원 등 모든 sub-tab 의 prerequisite 가 길드.
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
  // 정착지 전쟁 on = 명예상점 탭 추가(개인 명예 소비처). off = 미표시(byte-identical).
  const withHonor: GuildSubTabDef[] = V2_SETTLEMENT_WARFARE
    ? [...BASE_SUB_TABS, { key: "honor_shop", label: "명성상점" }]
    : [...BASE_SUB_TABS];
  const trainingBadge =
    trainingClaimableCount != null && trainingClaimableCount > 0
      ? trainingClaimableCount
      : undefined;
  const withTraining: GuildSubTabDef[] =
    info?.hasTrainingGround || (info?.settlementBuildings?.training_ground ?? 0) > 0
      ? [...withHonor, { key: "training", label: "훈련장", badge: trainingBadge }]
      : withHonor;
  // 마스터/관리자에게만 "관리" 탭 추가(가입 신청 대기 건수 뱃지) — 맨 뒤에 배치.
  const subTabs: GuildSubTabDef[] = canManage
    ? [
        ...withTraining,
        {
          key: "manage",
          label:
            pendingRequests.length > 0
              ? `관리 (${pendingRequests.length})`
              : "관리",
        },
      ]
    : withTraining;
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

      {activeTab === "honor_shop" && <HonorShopPanel />}

      {activeTab === "training" && (
        <GuildTrainingGroundPanel info={info} onChanged={refresh} />
      )}

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
          canManage={canManage}
          pendingRequests={pendingRequests}
          loading={loading}
          policyTargets={policyTargets}
          viewerUserId={viewerUserId}
          onGuildChanged={onGuildChanged}
          onOccupationsChanged={onOccupationsChanged}
        />
      )}

      {activeTab === "outposts" && (
        <GuildOutpostsPanel
          guildId={guildId}
          guildSettlements={guildSettlements}
          ownedOutposts={ownedOutposts}
          occByOutpost={occByOutpost}
          memberNameById={memberNameById}
        />
      )}
    </main>
  );
}
