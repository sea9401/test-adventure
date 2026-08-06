"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Lock, PencilSimple } from "@phosphor-icons/react";
import { AdminProvider, useAdmin } from "./AdminContext";

const adminTabLoading = () => (
  <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
    운영 도구를 불러오는 중입니다.
  </div>
);

// 운영 도구는 탭마다 의존성이 크므로, 현재 선택한 탭의 코드만 내려받는다.
const UsersTab = dynamic(() => import("./tabs/UsersTab").then((module) => module.UsersTab), { loading: adminTabLoading });
const StatsTab = dynamic(() => import("./tabs/StatsTab").then((module) => module.StatsTab), { loading: adminTabLoading });
const BalanceTelemetryTab = dynamic(() => import("./tabs/BalanceTelemetryTab").then((module) => module.BalanceTelemetryTab), { loading: adminTabLoading });
const GridDungeonAnalyticsTab = dynamic(() => import("./tabs/GridDungeonAnalyticsTab").then((module) => module.GridDungeonAnalyticsTab), { loading: adminTabLoading });
const SeasonOpsTab = dynamic(() => import("./tabs/SeasonOpsTab").then((module) => module.SeasonOpsTab), { loading: adminTabLoading });
const OpsDashboardTab = dynamic(() => import("./tabs/OpsDashboardTab").then((module) => module.OpsDashboardTab), { loading: adminTabLoading });
const OpsWorkflowsTab = dynamic(() => import("./tabs/OpsWorkflowsTab").then((module) => module.OpsWorkflowsTab), { loading: adminTabLoading });
const AbuseLogTab = dynamic(() => import("./tabs/AbuseLogTab").then((module) => module.AbuseLogTab), { loading: adminTabLoading });
const EconomyLogTab = dynamic(() => import("./tabs/EconomyLogTab").then((module) => module.EconomyLogTab), { loading: adminTabLoading });
const MarketplaceEconomyTab = dynamic(() => import("./tabs/MarketplaceEconomyTab").then((module) => module.MarketplaceEconomyTab), { loading: adminTabLoading });
const LifeGatheringTelemetryTab = dynamic(() => import("./tabs/LifeGatheringTelemetryTab").then((module) => module.LifeGatheringTelemetryTab), { loading: adminTabLoading });
const AuditLogTab = dynamic(() => import("./tabs/AuditLogTab").then((module) => module.AuditLogTab), { loading: adminTabLoading });
const BroadcastTab = dynamic(() => import("./tabs/BroadcastTab").then((module) => module.BroadcastTab), { loading: adminTabLoading });
const FeedbackTab = dynamic(() => import("./tabs/FeedbackTab").then((module) => module.FeedbackTab), { loading: adminTabLoading });
const OpsManualTab = dynamic(() => import("./tabs/OpsManualTab").then((module) => module.OpsManualTab), { loading: adminTabLoading });
const OpsSearchTab = dynamic(() => import("./tabs/OpsSearchTab").then((module) => module.OpsSearchTab), { loading: adminTabLoading });
const OnlineUsersTab = dynamic(() => import("./tabs/OnlineUsersTab").then((module) => module.OnlineUsersTab), { loading: adminTabLoading });

// 2026-06-03: v1 죽은 탭 제거(거래소·협동보스·퀘스트·제작·지도·룬·인벤토리 — v2 미참조).
// 2026-06-04: v1 데이터 브라우저(개요/모험의 서/데이터) 제거 — 로컬 *.v1 세이브 도구로 v2(서버 DB)엔 무용.
type TabKey =
  | "users"
  | "onlineUsers"
  | "stats"
  | "balance"
  | "gridDungeon"
  | "opsDashboard"
  | "opsWorkflows"
  | "season"
  | "abuse"
  | "economy"
  | "marketplaceEconomy"
  | "lifeGathering"
  | "opsSearch"
  | "broadcast"
  | "feedback"
  | "opsManual"
  | "audit";

type TabGroup = "daily" | "community" | "analytics" | "guide";

type AdminTab = {
  key: TabKey;
  label: string;
  description: string;
  group: TabGroup;
  keywords?: string;
};

const TABS: AdminTab[] = [
  { key: "opsDashboard", label: "운영 홈", description: "오늘 확인할 위험 신호와 주요 지표", group: "daily", keywords: "현황 대시보드 알림" },
  { key: "onlineUsers", label: "현재 접속자", description: "지금 게임에 접속한 유저 명단", group: "daily", keywords: "온라인 동시 접속 presence" },
  { key: "opsSearch", label: "통합 검색", description: "유저·이벤트·IP를 한 번에 검색", group: "daily", keywords: "로그 이벤트" },
  { key: "opsWorkflows", label: "처리 작업", description: "문의·보상 실패·반복 업무 처리", group: "daily", keywords: "워크플로 메모 보상" },
  { key: "users", label: "유저 관리", description: "유저 조회, 지급, 제재와 데이터 수정", group: "daily", keywords: "닉네임 계정 캐릭터" },
  { key: "broadcast", label: "공지·우편", description: "공지 등록과 개인·전체 우편 발송", group: "community", keywords: "메일 보상" },
  { key: "feedback", label: "건의사항", description: "버그 제보와 유저 의견 확인", group: "community", keywords: "문의 피드백" },
  { key: "season", label: "시즌 운영", description: "시즌 정산과 운영 스케줄 관리", group: "community" },
  { key: "stats", label: "전체 통계", description: "접속·성장·보유 현황 통계", group: "analytics" },
  { key: "balance", label: "밸런스 지표", description: "재화와 성장 분포 분석", group: "analytics" },
  { key: "gridDungeon", label: "격자 던전", description: "던전 진입·완주·실패 원인 분석", group: "analytics", keywords: "던전 분석" },
  { key: "economy", label: "경제 로그", description: "골드와 아이템 증감 기록", group: "analytics", keywords: "재화 아이템" },
  { key: "marketplaceEconomy", label: "거래소 경제", description: "거래량·가격 변동과 이상 거래 신호", group: "analytics", keywords: "거래소 호가 주문 세금 자전거래" },
  { key: "lifeGathering", label: "생활 수급", description: "벌목·채광 재화 수급량 분석", group: "analytics", keywords: "생활 벌목 채광 원목 광석 부산물" },
  { key: "abuse", label: "이상 행동", description: "요청 제한과 비정상 행동 기록", group: "analytics", keywords: "제재 어뷰징" },
  { key: "audit", label: "관리자 기록", description: "관리자 변경과 처리 이력", group: "analytics", keywords: "감사 로그" },
  { key: "opsManual", label: "운영 안내", description: "권한과 상황별 처리 절차", group: "guide", keywords: "매뉴얼 도움말" },
];

const GROUP_LABELS: Record<TabGroup, string> = {
  daily: "자주 쓰는 메뉴",
  community: "소통과 운영",
  analytics: "분석과 기록",
  guide: "도움말",
};

// 인접 동일 그룹 묶기 — 사이드바 그룹 헤더용. 순서는 TABS 정의 순 그대로.
function groupTabs<T extends { group: TabGroup }>(
  tabs: T[],
): { group: TabGroup; items: T[] }[] {
  const out: { group: TabGroup; items: T[] }[] = [];
  for (const t of tabs) {
    const last = out[out.length - 1];
    if (last && last.group === t.group) last.items.push(t);
    else out.push({ group: t.group, items: [t] });
  }
  return out;
}

function ShellInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = tabFromParam(searchParams.get("tab"));
  const { readOnly, setReadOnly, toast, adminMe, loadingAdminMe } = useAdmin();
  const [navQuery, setNavQuery] = useState("");
  const filteredTabs = useMemo(() => {
    const query = navQuery.trim().toLocaleLowerCase("ko-KR");
    if (!query) return TABS;
    return TABS.filter((item) =>
      `${item.label} ${item.description} ${item.keywords ?? ""}`
        .toLocaleLowerCase("ko-KR")
        .includes(query),
    );
  }, [navQuery]);
  const groups = groupTabs(filteredTabs);
  const activeTab = TABS.find((item) => item.key === tab) ?? TABS[0];
  const openTab = (next: TabKey) => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("tab", next);
    router.replace(`/admin?${sp.toString()}`, { scroll: false });
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              ← 게임으로
            </Link>
            <h1 className="text-base font-semibold">관리자 도구</h1>
            <span className="rounded bg-zinc-200 px-2 py-0.5 font-mono text-[11px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {loadingAdminMe ? "loading" : roleLabel(adminMe?.role ?? null)}
            </span>
          </div>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={readOnly}
              onChange={(e) => setReadOnly(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900"
            />
            <span className="inline-flex items-center gap-1">
              {readOnly ? (
                <Lock size={15} weight="duotone" />
              ) : (
                <PencilSimple size={15} weight="duotone" />
              )}
              {readOnly ? "보기 전용" : "편집 가능"}
            </span>
          </label>
        </div>
      </header>

      <div className="mx-auto max-w-[1440px] px-4 py-3">
        <details className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          <summary className="cursor-pointer list-none font-medium text-zinc-800 dark:text-zinc-100">
            {adminMe ? `${adminMe.email} · ${capabilityLabel(adminMe.capabilities)} 권한` : "권한 확인 중"}
            <span className="ml-2 font-normal text-zinc-400">주의사항과 권한 상세 보기</span>
          </summary>
          <div className="mt-2 border-t border-zinc-100 pt-2 leading-5 dark:border-zinc-800">
            게임 진행 상태를 직접 변경하는 화면입니다. 저장 후 대상 유저의 새로고침이 필요할 수 있습니다.
            {adminMe ? (
              <span className="block font-mono text-[10px] text-zinc-400">
                role {adminMe.role ?? "none"} · super {adminMe.roleConfig.super} · reward {adminMe.roleConfig.reward} · sanction {adminMe.roleConfig.sanction} · readonly {adminMe.roleConfig.readonly}
              </span>
            ) : null}
          </div>
        </details>
      </div>

      <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 pb-12 md:flex-row">
        <nav className="md:w-64 md:shrink-0" aria-label="관리자 메뉴">
          <label className="md:hidden">
            <span className="sr-only">관리자 메뉴 선택</span>
            <select
              value={tab}
              onChange={(event) => openTab(event.target.value as TabKey)}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              {groupTabs(TABS).map(({ group, items }) => (
                <optgroup key={group} label={GROUP_LABELS[group]}>
                  {items.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <div className="hidden flex-col gap-4 md:flex">
            <input
              value={navQuery}
              onChange={(event) => setNavQuery(event.target.value)}
              placeholder="메뉴 검색"
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500 dark:border-zinc-700 dark:bg-zinc-900"
            />
            {groups.map(({ group, items }) => (
              <div key={group}>
                <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  {GROUP_LABELS[group]}
                </div>
                <ul className="flex flex-col gap-0.5">
                  {items.map((t) => (
                    <li key={t.key}>
                      <button
                        type="button"
                        onClick={() => openTab(t.key)}
                        className={
                          tab === t.key
                            ? "w-full rounded-md border border-zinc-900 bg-zinc-900 px-3 py-2 text-left text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                            : "w-full rounded-md border border-transparent px-3 py-2 text-left text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        }
                      >
                        <span className="block text-sm font-medium">{t.label}</span>
                        <span className={tab === t.key ? "block text-[10px] text-zinc-300 dark:text-zinc-600" : "block text-[10px] text-zinc-400"}>{t.description}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {groups.length === 0 ? <p className="px-2 text-xs text-zinc-500">일치하는 메뉴가 없습니다.</p> : null}
          </div>
        </nav>

        <main className="flex-1 space-y-4">
          <div className="border-b border-zinc-200 pb-3 dark:border-zinc-800">
            <h2 className="text-lg font-semibold">{activeTab.label}</h2>
            <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{activeTab.description}</p>
          </div>
          {tab === "users" && <UsersTab />}
          {tab === "onlineUsers" && <OnlineUsersTab />}
          {tab === "stats" && <StatsTab />}
          {tab === "balance" && <BalanceTelemetryTab />}
          {tab === "gridDungeon" && <GridDungeonAnalyticsTab />}
          {tab === "opsDashboard" && <OpsDashboardTab />}
          {tab === "opsWorkflows" && <OpsWorkflowsTab />}
          {tab === "season" && <SeasonOpsTab />}
          {tab === "abuse" && <AbuseLogTab />}
          {tab === "economy" && <EconomyLogTab />}
          {tab === "marketplaceEconomy" && <MarketplaceEconomyTab />}
          {tab === "lifeGathering" && <LifeGatheringTelemetryTab />}
          {tab === "opsSearch" && <OpsSearchTab />}
          {tab === "broadcast" && <BroadcastTab />}
          {tab === "feedback" && <FeedbackTab />}
          {tab === "opsManual" && <OpsManualTab />}
          {tab === "audit" && <AuditLogTab />}
        </main>
      </div>

      {toast ? (
        <div className="fixed bottom-4 right-4 z-40 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function tabFromParam(raw: string | null): TabKey {
  return TABS.some((tab) => tab.key === raw) ? (raw as TabKey) : "opsDashboard";
}

function roleLabel(role: string | null) {
  if (role === "super") return "super";
  if (role === "reward") return "reward";
  if (role === "sanction") return "sanction";
  if (role === "readonly") return "readonly";
  return "no-role";
}

function capabilityLabel(capabilities: {
  reward: boolean;
  sanction: boolean;
  super: boolean;
}) {
  const labels = [
    capabilities.super ? "전체" : null,
    capabilities.reward ? "보상" : null,
    capabilities.sanction ? "제재" : null,
  ].filter(Boolean);
  return labels.length > 0 ? labels.join(", ") : "조회";
}

export function AdminShell() {
  return (
    <AdminProvider>
      <ShellInner />
    </AdminProvider>
  );
}
