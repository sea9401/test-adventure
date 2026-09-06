"use client";

import { useAdmin } from "@/admin/AdminContext";
import { adminPost } from "@/admin/api";
import { abuseActionLabel, abuseReasonLabel } from "@/admin/displayLabels";
import { type Dashboard } from "./opsDashboardTypes";
import {
  formatIntervalSec,
  Panel,
  riskMessageLabel,
  sanctionTypeLabel,
  toneClass,
} from "./OpsDashboardUi";
import { AdminUserLink } from "@/admin/ui/AdminUserLink";
import { Button } from "@/admin/ui/Field";
import { type AdminUserIdentity } from "@/admin/useAdminUserDirectory";
import { confirmGameAction } from "@/components/ui/gameDialog";
import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";

export function SuspicionMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded bg-zinc-100/80 px-2 py-1 dark:bg-zinc-800/70">
      <div className="text-[10px] text-zinc-400">{label}</div>
      <div className="mt-0.5 font-medium tabular-nums text-zinc-700 dark:text-zinc-200">{value}</div>
    </div>
  );
}


export function RecentSuspicionEvents({
  events,
}: {
  events: Dashboard["suspiciousUsers"][number]["recentEvents"];
}) {
  if (events.length === 0) {
    return <div className="border-t border-zinc-200 px-2 py-2 text-[11px] text-zinc-400 dark:border-zinc-700">최근 이벤트 없음</div>;
  }

  return (
    <ul className="divide-y divide-zinc-200 border-t border-zinc-200 dark:divide-zinc-700 dark:border-zinc-700">
      {events.map((event, index) => (
        <li key={`${event.createdAt}:${event.action}:${index}`} className="space-y-1 px-2 py-2 text-[11px]">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-0.5">
            <span className="font-medium text-zinc-700 dark:text-zinc-200">
              {abuseActionLabel(event.action)}
            </span>
            <span className="whitespace-nowrap text-[10px] text-zinc-400">
              {new Date(event.createdAt).toLocaleString("ko-KR")}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              {abuseReasonLabel(event.reason)}
            </span>
            {event.ip ? (
              <Link
                href={`/admin?tab=abuse&ip=${encodeURIComponent(event.ip)}`}
                className="font-mono text-[10px] text-zinc-500 underline decoration-zinc-300 underline-offset-2 dark:text-zinc-400 dark:decoration-zinc-700"
              >
                {event.ip}
              </Link>
            ) : (
              <span className="text-[10px] text-zinc-400">IP 없음</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}


export function OpsAlertDetail({
  alert,
  data,
  userDirectory,
}: {
  alert: Dashboard["alerts"][number];
  data: Dashboard;
  userDirectory: Record<string, AdminUserIdentity>;
}) {
  const detail = alert.detail;
  if (!detail) return null;

  if (detail.kind === "suspicious_user") {
    const row = data.suspiciousUsers.find(
      (candidate) => candidate.userId === detail.userId,
    );
    if (!row) return <p>현재 선택 기간에서 상세 이벤트를 찾지 못했습니다.</p>;
    const identity = userDirectory[row.userId];
    return (
      <div className="space-y-2">
        <div className="rounded border border-current/15 bg-white/40 p-2 dark:bg-black/10">
          <AdminUserLink
            userId={row.userId}
            gameName={identity?.gameName}
            email={identity?.email}
          />
          {identity?.gameName && identity.email ? (
            <div className="mt-1 text-[11px] opacity-75">{identity.email}</div>
          ) : null}
          <div className="mt-1 break-all font-mono text-[10px] opacity-70">{row.userId}</div>
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <AlertDetailMetric label="의심 점수" value={row.score} />
          <AlertDetailMetric label="이벤트" value={row.events} />
          <AlertDetailMetric label="제한" value={row.rateLimited} />
          <AlertDetailMetric label="보상 실패" value={row.rewardFailures} />
          <AlertDetailMetric label="행동 종류" value={row.actionCount} />
          <AlertDetailMetric label="연결 IP" value={row.ipCount} />
          <AlertDetailMetric
            label="평균 간격"
            value={formatIntervalSec(row.avgIntervalSec)}
          />
          <AlertDetailMetric
            label="최근 발생"
            value={new Date(row.lastAt).toLocaleString("ko-KR")}
          />
        </div>
        <div>
          <div className="mb-1 text-[11px] font-medium">탐지 요약</div>
          <div className="flex flex-wrap gap-1">
            {row.topActions.map((action) => (
              <span
                key={action.key}
                className="rounded border border-current/15 bg-white/40 px-1.5 py-0.5 text-[11px] dark:bg-black/10"
              >
                {abuseActionLabel(action.key)}{" "}
                <strong className="tabular-nums">{action.count.toLocaleString()}</strong>
              </span>
            ))}
          </div>
        </div>
        {row.ips.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="font-medium">연결 IP</span>
            {row.ips.map((ip) => (
              <Link
                key={ip}
                href={`/admin?tab=abuse&ip=${encodeURIComponent(ip)}`}
                className="rounded border border-current/20 px-1.5 py-0.5 font-mono underline underline-offset-2"
              >
                {ip}
              </Link>
            ))}
          </div>
        ) : null}
        <div>
          <div className="mb-1 text-[11px] font-medium">최근 이벤트</div>
          <div className="overflow-hidden rounded border border-current/15 bg-white/40 dark:bg-black/10">
            <RecentSuspicionEvents events={row.recentEvents} />
          </div>
        </div>
      </div>
    );
  }

  const row = data.connectedIps.find((candidate) => candidate.ip === detail.ip);
  if (!row) return <p>현재 선택 기간에서 연결 계정 상세를 찾지 못했습니다.</p>;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <Link
          href={`/admin?tab=abuse&ip=${encodeURIComponent(row.ip)}`}
          className="font-mono font-medium underline underline-offset-2"
        >
          {row.ip} 로그 전체 보기
        </Link>
        <span>
          이벤트 {row.events.toLocaleString()}건 · 행동 {row.actionCount.toLocaleString()}종 · 최근{" "}
          {new Date(row.lastAt).toLocaleString("ko-KR")}
        </span>
      </div>
      <div className="grid gap-1.5 md:grid-cols-2">
        {row.users.map((user) => {
          const identity = userDirectory[user.userId];
          return (
            <div
              key={user.userId}
              className="rounded border border-current/15 bg-white/40 p-2 dark:bg-black/10"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <AdminUserLink
                    userId={user.userId}
                    gameName={identity?.gameName}
                    email={identity?.email}
                  />
                  {identity?.gameName && identity.email ? (
                    <div className="mt-0.5 truncate text-[10px] opacity-70">
                      {identity.email}
                    </div>
                  ) : null}
                </div>
                <span className="whitespace-nowrap text-[11px]">
                  이벤트 {user.events.toLocaleString()} · 제한 {user.rateLimited.toLocaleString()}
                </span>
              </div>
              <div className="mt-1 break-all font-mono text-[10px] opacity-70">
                {user.userId}
              </div>
              <div className="mt-1 text-[10px] opacity-75">
                {user.topActions
                  .map((action) => `${abuseActionLabel(action.key)} ${action.count}`)
                  .join(", ") || "행동 기록 없음"}
              </div>
              <div className="mt-0.5 text-[10px] opacity-70">
                최초 {new Date(user.firstAt).toLocaleString("ko-KR")} · 최근{" "}
                {new Date(user.lastAt).toLocaleString("ko-KR")}
              </div>
            </div>
          );
        })}
      </div>
      {row.userCount > row.users.length ? (
        <p className="text-[11px] opacity-70">
          전체 {row.userCount.toLocaleString()}개 중 활동량이 많은 {row.users.length.toLocaleString()}개 계정만 표시합니다.
        </p>
      ) : null}
    </div>
  );
}


export function AlertDetailMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded border border-current/15 bg-white/40 px-2 py-1.5 dark:bg-black/10">
      <div className="text-[10px] opacity-65">{label}</div>
      <div className="mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}


export function RiskEventsPanel({ rows }: { rows: Dashboard["riskEvents"] }) {
  return (
    <Panel title="운영 위험도 표시">
      {rows.length === 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">강조할 위험 이벤트 없음</p>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {rows.map((row) => (
            <Link
              key={row.id}
              href={row.href}
              className={`rounded-md border px-3 py-2 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 ${toneClass(row.level)}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{row.title}</span>
                <span className="text-[11px] opacity-75">
                  {new Date(row.createdAt).toLocaleString("ko-KR")}
                </span>
              </div>
              <div className="mt-1 text-[11px] opacity-80">{riskMessageLabel(row.message)}</div>
            </Link>
          ))}
        </div>
      )}
    </Panel>
  );
}


export function SanctionRecommendationPanel({
  rows,
  userDirectory,
}: {
  rows: Dashboard["sanctionRecommendations"];
  userDirectory: Record<string, AdminUserIdentity>;
}) {
  const { showToast, adminMe } = useAdmin();
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const canSanction = Boolean(adminMe?.capabilities.sanction);

  const applySanction = async (
    userId: string,
    action: "warn" | "suspend",
    days: number,
    reason: string,
  ) => {
    const label = action === "warn" ? "경고" : `${days}일 정지`;
    const identity = userDirectory[userId];
    const target = identity?.gameName || identity?.email || `유저 ${userId.slice(0, 8)}`;
    if (!(await confirmGameAction(`${target} 계정에 ${label}를 적용할까요?`))) return;
    setSavingUserId(userId);
    try {
      const userFacingReason =
        action === "warn"
          ? "비정상 반복 플레이 패턴이 확인되어 경고 처리되었습니다."
          : `자동화 의심 행위가 반복되어 ${days}일 이용 제한이 적용되었습니다.`;
      await adminPost("/api/admin/sanctions", {
        userId,
        action,
        days,
        reason: userFacingReason,
        adminMemo: `운영 현황 제재 추천에서 실행 · ${reason}`,
      });
      showToast(`제재 처리 완료: ${label}`);
    } catch (e) {
      showToast(`제재 실패: ${e instanceof Error ? e.message : "오류"}`);
    } finally {
      setSavingUserId(null);
    }
  };

  return (
    <Panel title="제재 검토 추천">
      {rows.length === 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">추천 대상 없음</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-zinc-500 dark:text-zinc-400">
              <tr>
                <th className="py-1 pr-3 font-medium">유저</th>
                <th className="py-1 pr-3 font-medium">점수</th>
                <th className="py-1 pr-3 font-medium">추천</th>
                <th className="py-1 pr-3 font-medium">근거</th>
                <th className="py-1 pr-3 font-medium">실행</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.userId} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="py-1 pr-3">
                    <AdminUserLink
                      userId={row.userId}
                      gameName={userDirectory[row.userId]?.gameName}
                      email={userDirectory[row.userId]?.email}
                    />
                  </td>
                  <td className="py-1 pr-3 tabular-nums">{row.score.toLocaleString()}</td>
                  <td className="py-1 pr-3">{row.recommendation}</td>
                  <td className="py-1 pr-3 text-zinc-500">{row.reason}</td>
                  <td className="py-1 pr-3">
                    <div className="flex flex-wrap gap-1">
                      <Button
                        disabled={!canSanction || savingUserId === row.userId}
                        onClick={() => void applySanction(row.userId, "warn", 0, row.reason)}
                      >
                        경고
                      </Button>
                      <Button
                        disabled={!canSanction || savingUserId === row.userId}
                        onClick={() => void applySanction(row.userId, "suspend", 1, row.reason)}
                      >
                        1일
                      </Button>
                      <Button
                        disabled={!canSanction || savingUserId === row.userId}
                        onClick={() => void applySanction(row.userId, "suspend", 3, row.reason)}
                      >
                        3일
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}


export function SanctionReportPanel({ report }: { report: Dashboard["sanctionReport"] }) {
  return (
    <Panel title="제재 만료·해제 리포트">
      <div className="grid gap-3 lg:grid-cols-2">
        <MiniSanctionList
          title="24시간 내 만료"
          rows={report.expiring24h.map((row) => ({
            key: row.id,
            name: row.gameName ?? row.userId.slice(0, 10),
            meta: `${sanctionTypeLabel(row.type)} · ${row.expiresAt ? new Date(row.expiresAt).toLocaleString("ko-KR") : "-"}`,
            reason: row.reason,
          }))}
        />
        <MiniSanctionList
          title="최근 해제"
          rows={report.lifted.map((row) => ({
            key: row.id,
            name: row.gameName ?? row.userId.slice(0, 10),
            meta: `${sanctionTypeLabel(row.type)} · ${row.liftedByEmail ?? "-"} · ${row.liftedAt ? new Date(row.liftedAt).toLocaleString("ko-KR") : "-"}`,
            reason: row.reason,
          }))}
        />
      </div>
    </Panel>
  );
}


export function MiniSanctionList({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ key: number; name: string; meta: string; reason: string }>;
}) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium text-zinc-500">{title}</div>
      {rows.length === 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">없음</p>
      ) : (
        <ul className="space-y-1 text-xs">
          {rows.map((row) => (
            <li key={row.key} className="rounded-md border border-zinc-100 px-2 py-1 dark:border-zinc-800">
              <div className="font-mono">{row.name}</div>
              <div className="mt-0.5 text-[11px] text-zinc-500">{row.meta}</div>
              {row.reason ? <div className="mt-0.5 text-[11px]">{row.reason}</div> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
