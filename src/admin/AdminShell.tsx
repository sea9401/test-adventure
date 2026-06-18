"use client";

import { useState } from "react";
import Link from "next/link";
import { AdminProvider, useAdmin } from "./AdminContext";
import { UsersTab } from "./tabs/UsersTab";
import { StatsTab } from "./tabs/StatsTab";
import { GuildsTab } from "./tabs/GuildsTab";
import { BalanceTelemetryTab } from "./tabs/BalanceTelemetryTab";

// 2026-06-03: v1 죽은 탭 제거(거래소·협동보스·퀘스트·제작·지도·룬·인벤토리 — v2 미참조).
// 2026-06-04: v1 데이터 브라우저(개요/모험의 서/데이터) 제거 — 로컬 *.v1 세이브 도구로 v2(서버 DB)엔 무용.
type TabKey = "users" | "stats" | "balance" | "guilds";

type TabGroup = "system";

const TABS: { key: TabKey; label: string; group: TabGroup }[] = [
  { key: "users", label: "유저", group: "system" },
  { key: "stats", label: "통계", group: "system" },
  { key: "balance", label: "밸런스", group: "system" },
  { key: "guilds", label: "길드 의뢰", group: "system" },
];

const GROUP_LABELS: Record<TabGroup, string> = {
  system: "시스템",
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
  const [tab, setTab] = useState<TabKey>("users");
  const { readOnly, setReadOnly, toast } = useAdmin();
  const groups = groupTabs(TABS);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              ← 게임으로
            </Link>
            <h1 className="text-base font-semibold">관리자 도구</h1>
            <span className="rounded bg-zinc-200 px-2 py-0.5 font-mono text-[11px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              dev
            </span>
          </div>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={readOnly}
              onChange={(e) => setReadOnly(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900"
            />
            <span>{readOnly ? "🔒 보기 전용" : "✏️ 편집 가능"}</span>
          </label>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-3">
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          ⚠️ 이 페이지는 게임 진행 상태를 직접 변경합니다. 변경 후 게임 라우트는
          새로고침이 필요할 수 있습니다.
        </div>
      </div>

      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 pb-12 md:flex-row">
        <nav className="md:w-48 md:shrink-0">
          {/* 모바일: 그룹 헤더 숨기고 가로 스크롤 / 데스크탑: 세로 + 그룹 헤더 */}
          <ul className="flex flex-row flex-wrap gap-1 md:hidden">
            {TABS.map((t) => (
              <li key={t.key}>
                <button
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={
                    tab === t.key
                      ? "rounded-md border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-left text-sm font-medium text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                      : "rounded-md border border-transparent px-3 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }
                >
                  {t.label}
                </button>
              </li>
            ))}
          </ul>
          <div className="hidden flex-col gap-3 md:flex">
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
                        onClick={() => setTab(t.key)}
                        className={
                          tab === t.key
                            ? "w-full rounded-md border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-left text-sm font-medium text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                            : "w-full rounded-md border border-transparent px-3 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        }
                      >
                        {t.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        <main className="flex-1 space-y-4">
          {tab === "users" && <UsersTab />}
          {tab === "stats" && <StatsTab />}
          {tab === "balance" && <BalanceTelemetryTab />}
          {tab === "guilds" && <GuildsTab />}
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

export function AdminShell() {
  return (
    <AdminProvider>
      <ShellInner />
    </AdminProvider>
  );
}
