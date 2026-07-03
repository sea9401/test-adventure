"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAdmin } from "../AdminContext";
import { adminGet, adminPost } from "../api";
import { Button } from "../ui/Field";
import { useAsyncData } from "@/lib/useAsyncData";

type CountRow = { key: string; count: number };

type DailyReport = {
  rewardFailures: number;
  rewardFailuresHandled: number;
  rewardCompensated: number;
  sanctionsChanged: number;
  abuseEvents: number;
  rateLimited: number;
  largeGoldEvents: number;
  adminChanges: number;
  goldNet: number;
};

type Dashboard = {
  generatedAt: string;
  periodHours: number;
  webhookConfigured: boolean;
  alertChannels: {
    default: boolean;
    reward: boolean;
    abuse: boolean;
    economy: boolean;
    deploy: boolean;
  };
  alertThresholds: AlertThresholdSettings;
  suggestedAlertThresholds: AlertThresholdSettings;
  alertHistory: AlertHistoryEntry[];
  opsSummary: string[];
  compensationOverview: {
    count: number;
    userCount: number;
    totalQuantity: number;
    byKind: CountRow[];
  };
  dailyReport: DailyReport;
  periodComparison: {
    current: DailyReport;
    previous: DailyReport;
    deltas: DailyReport;
  };
  sanctionReport: {
    expiring24h: Array<{
      id: number;
      userId: string;
      gameName: string | null;
      type: string;
      reason: string;
      expiresAt: string | null;
    }>;
    lifted: Array<{
      id: number;
      userId: string;
      gameName: string | null;
      type: string;
      reason: string;
      liftedAt: string | null;
      liftedByEmail: string | null;
    }>;
  };
  riskEvents: Array<{
    id: string;
    level: "danger" | "warning" | "info";
    title: string;
    message: string;
    createdAt: string;
    href: string;
  }>;
  alerts: Array<{
    level: "danger" | "warning" | "info";
    title: string;
    message: string;
  }>;
  abuse: {
    last5m: number;
    last1h: number;
    last24h: number;
    rateLimited24h: number;
    topActions: CountRow[];
    topIps: CountRow[];
    topUsers: CountRow[];
  };
  economy: {
    last1h: number;
    last24h: number;
    goldIn24h: number;
    goldOut24h: number;
    rewardFailures24h: number;
    largeGoldEvents24h: number;
    topEvents: CountRow[];
    topItems: CountRow[];
    topRewardFailures: CountRow[];
  };
  audit: {
    last24h: number;
    latest: Array<{
      id: number;
      adminEmail: string;
      action: string;
      targetUserId: string | null;
      createdAt: string;
    }>;
  };
  slowQueryCandidates: Array<{
    key: string;
    status: string;
    cacheTtlSec: number;
    note: string;
  }>;
  suspiciousUsers: Array<{
    userId: string;
    score: number;
    events: number;
    rateLimited: number;
    actionCount: number;
    ipCount: number;
    ips: string[];
    topActions: CountRow[];
    recentEvents: Array<{
      action: string;
      reason: string;
      ip: string | null;
      createdAt: string;
    }>;
    lastAt: string;
  }>;
  sanctionRecommendations: Array<{
    userId: string;
    score: number;
    recommendation: string;
    reason: string;
    href: string;
  }>;
  connectedIps: Array<{
    ip: string;
    events: number;
    rateLimited: number;
    userCount: number;
    actionCount: number;
    userIds: string[];
    lastAt: string;
  }>;
  rewardFailureCandidates: Array<{
    id: number;
    userId: string | null;
    eventType: string;
    itemId: string | null;
    detail: Record<string, unknown> | null;
    createdAt: string;
    classification: {
      key: string;
      label: string;
      tone: "danger" | "warning" | "info";
      priority: number;
      action: string;
    };
  }>;
  rewardFailureStatusRecent: RewardFailureStatusEntry[];
  opsChangeHistory: Array<{
    id: number;
    adminEmail: string;
    action: string;
    targetUserId: string | null;
    summary: string;
    createdAt: string;
  }>;
};

type HotTimeSettings = {
  enabled: boolean;
  title: string;
  startsAt: string;
  endsAt: string;
  bonuses: {
    goldPct: number;
    expPct: number;
    masteryPct: number;
    fishingCoinPct: number;
  };
  note: string;
};

type HotTimeSchedule = {
  id: string;
  enabled: boolean;
  title: string;
  days: number[];
  startsAt: string;
  endsAt: string;
  bonuses: HotTimeSettings["bonuses"];
  note: string;
};

type AlertThresholdSettings = {
  abuseLast5m: number;
  abuseLast1h: number;
  rewardFailures: number;
  largeGoldEvents: number;
  adminAudit: number;
  repeatUserEvents: number;
  connectedIpUsers: number;
  topActionEvents: number;
};

type AlertHistoryEntry = {
  id: string;
  message: string;
  detail: Record<string, unknown> | null;
  status: "sent" | "failed" | "skipped";
  error: string | null;
  createdAt: string;
};

type RewardFailureStatus = "reviewed" | "compensated" | "ignored";

type RewardFailureStatusEntry = {
  eventId: number;
  status: RewardFailureStatus;
  note: string;
  adminEmail: string;
  updatedAt: string;
};

type RewardCompensationPreset = {
  id: string;
  label: string;
  itemKind:
    | "gold"
    | "fishing_coin"
    | "treasure_coin"
    | "mastery_certificate"
    | "stamina_potion"
    | "material";
  itemId: string;
  quantity: number;
  reason: string;
};

const COMP_KIND_OPTIONS: RewardCompensationPreset["itemKind"][] = [
  "gold",
  "fishing_coin",
  "treasure_coin",
  "mastery_certificate",
  "stamina_potion",
  "material",
];

export function OpsDashboardTab() {
  const { showToast } = useAdmin();
  const [hours, setHours] = useState(24);
  const { data, loading, error, refetch } = useAsyncData<{ ok: true } & Dashboard>(
    (signal) => adminGet(`/api/admin/ops-dashboard?hours=${hours}`, signal),
    [hours],
  );
  const [testingWebhook, setTestingWebhook] = useState(false);

  useEffect(() => {
    if (error) showToast(`조회 실패: ${error}`);
  }, [error, showToast]);

  const testWebhook = async () => {
    setTestingWebhook(true);
    try {
      await adminPost("/api/admin/ops-alert-test", {});
      showToast("알림 테스트 전송됨");
    } catch (e) {
      showToast(`알림 테스트 실패: ${e instanceof Error ? e.message : "오류"}`);
    } finally {
      setTestingWebhook(false);
    }
  };
  const periodLabel = hours === 168 ? "7일" : `${hours}시간`;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">운영 현황판</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            선택 기간({periodLabel}) 기준 이상 행동, 경제 이벤트, 관리자 변경 흐름을 봅니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-950"
          >
            <option value={1}>1시간</option>
            <option value={6}>6시간</option>
            <option value={24}>24시간</option>
            <option value={168}>7일</option>
          </select>
          <Button onClick={() => void testWebhook()} disabled={testingWebhook}>
            {testingWebhook ? "전송 중..." : "알림 테스트"}
          </Button>
          <Button onClick={() => void refetch()} disabled={loading}>
            {loading ? "조회 중..." : "새로고침"}
          </Button>
        </div>
      </div>

      {!data ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {loading ? "불러오는 중..." : "데이터 없음"}
        </p>
      ) : (
        <>
          <div className="grid gap-2">
            {!data.webhookConfigured ? (
              <AlertCard
                level="warning"
                title="알림 웹훅 미설정"
                message="OPS_ALERT_WEBHOOK_URL 이 없어서 임계치 초과 알림은 관리자 화면에서만 확인됩니다."
              />
            ) : null}
            {data.alerts.length === 0 ? (
              <AlertCard
                level="info"
                title="주의 알림 없음"
                message="최근 운영 지표가 설정된 임계치 안에 있습니다."
              />
            ) : (
              data.alerts.map((alert) => (
                <AlertCard
                  key={`${alert.level}:${alert.title}`}
                  level={alert.level}
                  title={alert.title}
                  message={alert.message}
                />
              ))
            )}
          </div>

          <OpsSummaryPanel lines={data.opsSummary} />
          <div className="grid gap-2 md:grid-cols-4">
            <Metric label="제한 초과 5분" value={data.abuse.last5m} />
            <Metric label="제한 초과 1시간" value={data.abuse.last1h} />
            <Metric label="경제 이벤트 1시간" value={data.economy.last1h} />
            <Metric label={`관리자 변경 ${periodLabel}`} value={data.audit.last24h} />
          </div>

          <DailyReportPanel report={data.dailyReport} periodLabel={periodLabel} />
          <CompensationOverviewPanel overview={data.compensationOverview} />
          <PeriodComparisonPanel comparison={data.periodComparison} />
          <RiskEventsPanel rows={data.riskEvents} />

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel title="이상 행동 Top">
              <CountList rows={data.abuse.topActions} empty="action 없음" />
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <MiniList title="IP" rows={data.abuse.topIps} />
                <MiniList title="유저" rows={data.abuse.topUsers} />
              </div>
            </Panel>
            <Panel title="경제 이벤트">
              <div className="mb-2 grid grid-cols-2 gap-2 text-xs">
                <Metric label={`골드 유입 ${periodLabel}`} value={data.economy.goldIn24h} />
                <Metric label={`골드 유출 ${periodLabel}`} value={data.economy.goldOut24h} />
                <Metric
                  label={`보상 실패 ${periodLabel}`}
                  value={data.economy.rewardFailures24h}
                />
                <Metric
                  label="대량 골드 이동"
                  value={data.economy.largeGoldEvents24h}
                />
              </div>
              <CountList rows={data.economy.topEvents} empty="event 없음" />
              {data.economy.topRewardFailures.length > 0 ? (
                <div className="mt-2">
                  <MiniList title="보상 실패" rows={data.economy.topRewardFailures} />
                </div>
              ) : null}
            </Panel>
          </div>

          <Panel title="느린 쿼리 후보">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-zinc-500 dark:text-zinc-400">
                  <tr>
                    <th className="py-1 pr-3 font-medium">key</th>
                    <th className="py-1 pr-3 font-medium">상태</th>
                    <th className="py-1 pr-3 font-medium">TTL</th>
                    <th className="py-1 pr-3 font-medium">메모</th>
                  </tr>
                </thead>
                <tbody>
                  {data.slowQueryCandidates.map((row) => (
                    <tr key={row.key} className="border-t border-zinc-100 dark:border-zinc-800">
                      <td className="py-1 pr-3 font-mono">{row.key}</td>
                      <td className="py-1 pr-3">{row.status}</td>
                      <td className="py-1 pr-3 tabular-nums">{row.cacheTtlSec}s</td>
                      <td className="py-1 pr-3 text-zinc-500">{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="매크로 의심 점수">
            {data.suspiciousUsers.length === 0 ? (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">의심 점수 없음</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-zinc-500 dark:text-zinc-400">
                    <tr>
                      <th className="py-1 pr-3 font-medium">userId</th>
                      <th className="py-1 pr-3 font-medium">점수</th>
                      <th className="py-1 pr-3 font-medium">제한</th>
                      <th className="py-1 pr-3 font-medium">이벤트</th>
                      <th className="hidden py-1 pr-3 font-medium md:table-cell">action/IP</th>
                      <th className="py-1 pr-3 font-medium">최근·상세</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.suspiciousUsers.map((row) => (
                      <tr key={row.userId} className="border-t border-zinc-100 dark:border-zinc-800">
                        <td className="py-1 pr-3 font-mono">
                          <Link
                            href={`/admin?tab=abuse&userId=${encodeURIComponent(row.userId)}`}
                            className="underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900 dark:decoration-zinc-700 dark:hover:text-white"
                          >
                            {row.userId.slice(0, 12)}
                          </Link>
                        </td>
                        <td className="py-1 pr-3 tabular-nums">{row.score}</td>
                        <td className="py-1 pr-3 tabular-nums">{row.rateLimited}</td>
                        <td className="py-1 pr-3 tabular-nums">{row.events}</td>
                        <td className="hidden py-1 pr-3 tabular-nums md:table-cell">
                          {row.actionCount}/
                          {row.ips.length > 0 ? (
                            <Link
                              href={`/admin?tab=abuse&ip=${encodeURIComponent(row.ips[0])}`}
                              className="underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900 dark:decoration-zinc-700 dark:hover:text-white"
                            >
                              {row.ipCount}
                            </Link>
                          ) : (
                            row.ipCount
                          )}
                        </td>
                        <td className="py-1 pr-3 text-zinc-500">
                          <div>{new Date(row.lastAt).toLocaleString("ko-KR")}</div>
                          <div className="mt-0.5 max-w-[320px] text-[11px]">
                            {row.topActions.map((action) => `${action.key} ${action.count}`).join(", ") || "-"}
                          </div>
                          <div className="mt-0.5 hidden max-w-[360px] text-[11px] md:block">
                            {row.recentEvents
                              .map((event) => `${event.action}/${event.reason}${event.ip ? `/${event.ip}` : ""}`)
                              .join(" · ") || "-"}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="IP 연결 계정">
            {data.connectedIps.length === 0 ? (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">연결 후보 없음</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-zinc-500 dark:text-zinc-400">
                    <tr>
                      <th className="py-1 pr-3 font-medium">IP</th>
                      <th className="py-1 pr-3 font-medium">계정</th>
                      <th className="py-1 pr-3 font-medium">제한/이벤트</th>
                      <th className="py-1 pr-3 font-medium">userIds</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.connectedIps.map((row) => (
                      <tr key={row.ip} className="border-t border-zinc-100 dark:border-zinc-800">
                        <td className="py-1 pr-3 font-mono">
                          <Link
                            href={`/admin?tab=abuse&ip=${encodeURIComponent(row.ip)}`}
                            className="underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900 dark:decoration-zinc-700 dark:hover:text-white"
                          >
                            {row.ip}
                          </Link>
                        </td>
                        <td className="py-1 pr-3 tabular-nums">{row.userCount}</td>
                        <td className="py-1 pr-3 tabular-nums">
                          {row.rateLimited}/{row.events}
                        </td>
                        <td className="py-1 pr-3 font-mono text-[11px] text-zinc-500">
                          {row.userIds.map((id) => id.slice(0, 8)).join(", ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <SanctionRecommendationPanel rows={data.sanctionRecommendations} />
          <RewardFailurePanel rows={data.rewardFailureCandidates} onDone={refetch} />
          <RewardFailureStatusPanel rows={data.rewardFailureStatusRecent} onDone={refetch} />
          <CompensationPresetPanel />

          <AlertThresholdPanel
            value={data.alertThresholds}
            suggested={data.suggestedAlertThresholds}
            onSaved={refetch}
          />
          <SanctionReportPanel report={data.sanctionReport} />
          <AlertChannelsPanel value={data.alertChannels} />
          <OpsChangeHistoryPanel rows={data.opsChangeHistory} />
          <AlertHistoryPanel rows={data.alertHistory} />
          <HotTimePanel />
        </>
      )}
    </section>
  );
}

function DailyReportPanel({
  report,
  periodLabel,
}: {
  report: Dashboard["dailyReport"];
  periodLabel: string;
}) {
  return (
    <Panel title={`운영 리포트 (${periodLabel})`}>
      <div className="grid gap-2 md:grid-cols-4">
        <Metric label="보상 실패" value={report.rewardFailures} />
        <Metric label="처리된 실패" value={report.rewardFailuresHandled} />
        <Metric label="보정 완료" value={report.rewardCompensated} />
        <Metric label="제재 변경" value={report.sanctionsChanged} />
        <Metric label="제한 이벤트" value={report.rateLimited} />
        <Metric label="대량 골드" value={report.largeGoldEvents} />
        <Metric label="관리자 변경" value={report.adminChanges} />
        <Metric label="골드 순변동" value={report.goldNet} />
      </div>
    </Panel>
  );
}

function OpsSummaryPanel({ lines }: { lines: string[] }) {
  return (
    <Panel title="운영 자동 요약">
      {lines.length === 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">요약할 변화 없음</p>
      ) : (
        <ul className="grid gap-1 text-xs md:grid-cols-2">
          {lines.map((line) => (
            <li key={line} className="rounded-md border border-zinc-100 px-2 py-1.5 dark:border-zinc-800">
              {line}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function CompensationOverviewPanel({
  overview,
}: {
  overview: Dashboard["compensationOverview"];
}) {
  return (
    <Panel title="보정 지급 안전 요약">
      <div className="grid gap-2 md:grid-cols-3">
        <Metric label="24시간 보정" value={overview.count} />
        <Metric label="대상 유저" value={overview.userCount} />
        <Metric label="총 수량" value={overview.totalQuantity} />
      </div>
      {overview.byKind.length > 0 ? (
        <div className="mt-2">
          <MiniList title="품목별" rows={overview.byKind} />
        </div>
      ) : null}
    </Panel>
  );
}

function PeriodComparisonPanel({
  comparison,
}: {
  comparison: Dashboard["periodComparison"];
}) {
  const rows: Array<{ key: keyof DailyReport; label: string }> = [
    { key: "rewardFailures", label: "보상 실패" },
    { key: "rateLimited", label: "제한 이벤트" },
    { key: "largeGoldEvents", label: "대량 골드" },
    { key: "adminChanges", label: "관리자 변경" },
    { key: "goldNet", label: "골드 순변동" },
  ];
  return (
    <Panel title="24시간 비교">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-zinc-500 dark:text-zinc-400">
            <tr>
              <th className="py-1 pr-3 font-medium">항목</th>
              <th className="py-1 pr-3 font-medium">최근 24시간</th>
              <th className="py-1 pr-3 font-medium">이전 24시간</th>
              <th className="py-1 pr-3 font-medium">변화</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-zinc-100 dark:border-zinc-800">
                <td className="py-1 pr-3">{row.label}</td>
                <td className="py-1 pr-3 tabular-nums">
                  {comparison.current[row.key].toLocaleString()}
                </td>
                <td className="py-1 pr-3 tabular-nums">
                  {comparison.previous[row.key].toLocaleString()}
                </td>
                <td className={`py-1 pr-3 tabular-nums ${deltaClass(comparison.deltas[row.key])}`}>
                  {formatDelta(comparison.deltas[row.key])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function RiskEventsPanel({ rows }: { rows: Dashboard["riskEvents"] }) {
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
              <div className="mt-1 font-mono text-[11px] opacity-80">{row.message}</div>
            </Link>
          ))}
        </div>
      )}
    </Panel>
  );
}

function SanctionRecommendationPanel({
  rows,
}: {
  rows: Dashboard["sanctionRecommendations"];
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
    if (!window.confirm(`${userId.slice(0, 12)} 계정에 ${label}를 적용할까요?`)) return;
    setSavingUserId(userId);
    try {
      await adminPost("/api/admin/sanctions", {
        userId,
        action,
        days,
        reason,
        adminMemo: "운영 현황 제재 추천에서 실행",
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
                <th className="py-1 pr-3 font-medium">userId</th>
                <th className="py-1 pr-3 font-medium">점수</th>
                <th className="py-1 pr-3 font-medium">추천</th>
                <th className="py-1 pr-3 font-medium">근거</th>
                <th className="py-1 pr-3 font-medium">실행</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.userId} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="py-1 pr-3 font-mono">
                    <Link
                      href={row.href}
                      className="underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900 dark:decoration-zinc-700 dark:hover:text-white"
                    >
                      {row.userId.slice(0, 12)}
                    </Link>
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

function RewardFailurePanel({
  rows,
  onDone,
}: {
  rows: Dashboard["rewardFailureCandidates"];
  onDone: () => void;
}) {
  const { showToast } = useAdmin();
  const [selected, setSelected] = useState<number[]>([]);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<RewardFailureStatus>("reviewed");
  const [saving, setSaving] = useState(false);
  const selectedSet = new Set(selected);

  const toggle = (id: number) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id],
    );
  };

  const markReviewed = async () => {
    if (selected.length === 0) return;
    setSaving(true);
    try {
      await adminPost("/api/admin/reward-failures/resolve", {
        eventIds: selected,
        note,
        status,
      });
      setSelected([]);
      setNote("");
      showToast("선택 보상 실패 상태 저장됨");
      onDone();
    } catch (e) {
      showToast(`처리 실패: ${e instanceof Error ? e.message : "오류"}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title="보상 실패 보정 후보">
      {rows.length === 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">후보 없음</p>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-end gap-2 text-xs">
            <TextField
              label="처리 메모"
              value={note}
              onChange={setNote}
            />
            <label className="space-y-1 text-xs">
              <span className="text-zinc-500 dark:text-zinc-400">상태</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as RewardFailureStatus)}
                className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="reviewed">검토 완료</option>
                <option value="compensated">보정 완료</option>
                <option value="ignored">제외</option>
              </select>
            </label>
            <Button
              onClick={() => void markReviewed()}
              disabled={saving || selected.length === 0}
            >
              {saving ? "처리 중..." : `선택 ${selected.length}건 검토 처리`}
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-zinc-500 dark:text-zinc-400">
                <tr>
                  <th className="py-1 pr-3 font-medium">선택</th>
                  <th className="py-1 pr-3 font-medium">event id</th>
                  <th className="py-1 pr-3 font-medium">유저</th>
                  <th className="py-1 pr-3 font-medium">추정</th>
                  <th className="hidden py-1 pr-3 font-medium md:table-cell">유형</th>
                  <th className="hidden py-1 pr-3 font-medium md:table-cell">시각</th>
                  <th className="py-1 pr-3 font-medium">조치</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="py-1 pr-3">
                      <input
                        type="checkbox"
                        checked={selectedSet.has(row.id)}
                        onChange={() => toggle(row.id)}
                      />
                    </td>
                    <td className="py-1 pr-3 font-mono">{row.id}</td>
                    <td className="py-1 pr-3 font-mono">
                      {row.userId ? (
                        <Link
                          href={`/admin?tab=economy&userId=${encodeURIComponent(row.userId)}&eventType=${encodeURIComponent(row.eventType)}`}
                          className="underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900 dark:decoration-zinc-700 dark:hover:text-white"
                        >
                          {row.userId.slice(0, 12)}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="py-1 pr-3">
                      <div className={classificationClass(row.classification.tone)}>
                        {row.classification.label}
                      </div>
                      <div className="mt-0.5 hidden max-w-[240px] text-[11px] text-zinc-500 md:block">
                        {row.classification.action}
                      </div>
                    </td>
                    <td className="hidden py-1 pr-3 font-mono md:table-cell">{row.itemId ?? row.eventType}</td>
                    <td className="hidden py-1 pr-3 text-zinc-500 md:table-cell">
                      {new Date(row.createdAt).toLocaleString("ko-KR")}
                    </td>
                    <td className="py-1 pr-3">
                      {row.userId ? (
                        <Link
                          href={`/admin?tab=users&q=${encodeURIComponent(row.userId)}&sourceEventId=${row.id}`}
                          className="underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900 dark:decoration-zinc-700 dark:hover:text-white"
                        >
                          유저 보정
                        </Link>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Panel>
  );
}

function RewardFailureStatusPanel({
  rows,
  onDone,
}: {
  rows: RewardFailureStatusEntry[];
  onDone: () => void;
}) {
  const { showToast } = useAdmin();
  const [filter, setFilter] = useState<RewardFailureStatus | "all">("all");
  const [savingId, setSavingId] = useState<number | null>(null);
  const filtered = filter === "all" ? rows : rows.filter((row) => row.status === filter);

  const reopen = async (eventId: number) => {
    setSavingId(eventId);
    try {
      await adminPost("/api/admin/reward-failures/resolve", {
        eventIds: [eventId],
        note: "후보로 되돌림",
        status: "open",
      });
      showToast("보상 실패 후보로 되돌림");
      onDone();
    } catch (e) {
      showToast(`되돌리기 실패: ${e instanceof Error ? e.message : "오류"}`);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Panel title="최근 보상 실패 처리 상태">
      {rows.length === 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">처리 이력 없음</p>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-zinc-500 dark:text-zinc-400">상태 필터</span>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as RewardFailureStatus | "all")}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="all">전체</option>
              <option value="reviewed">검토 완료</option>
              <option value="compensated">보정 완료</option>
              <option value="ignored">제외</option>
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-zinc-500 dark:text-zinc-400">
                <tr>
                  <th className="py-1 pr-3 font-medium">event id</th>
                  <th className="py-1 pr-3 font-medium">상태</th>
                  <th className="py-1 pr-3 font-medium">관리자</th>
                  <th className="py-1 pr-3 font-medium">메모</th>
                  <th className="py-1 pr-3 font-medium">시각</th>
                  <th className="py-1 pr-3 font-medium">조치</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.eventId} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="py-1 pr-3 font-mono">{row.eventId}</td>
                    <td className="py-1 pr-3">{statusLabel(row.status)}</td>
                    <td className="py-1 pr-3 text-zinc-500">{row.adminEmail}</td>
                    <td className="py-1 pr-3">{row.note || "-"}</td>
                    <td className="py-1 pr-3 text-zinc-500">
                      {new Date(row.updatedAt).toLocaleString("ko-KR")}
                    </td>
                    <td className="py-1 pr-3">
                      <Button
                        onClick={() => void reopen(row.eventId)}
                        disabled={savingId === row.eventId}
                      >
                        {savingId === row.eventId ? "처리 중..." : "후보로"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 ? (
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                필터에 맞는 이력 없음
              </p>
            ) : null}
          </div>
        </div>
      )}
    </Panel>
  );
}

function CompensationPresetPanel() {
  const { showToast } = useAdmin();
  const { data, loading, error, refetch } = useAsyncData<{
    rewardCompensationPresets: RewardCompensationPreset[];
    rewardCompensationPresetsUpdatedByEmail: string | null;
    rewardCompensationPresetsUpdatedAt: string | null;
  }>((signal) => adminGet("/api/admin/ops-settings", signal));
  const { data: auditData } = useAsyncData<{
    entries: Array<{
      id: number;
      adminEmail: string;
      detail: Record<string, unknown> | null;
      createdAt: string;
    }>;
  }>((signal) =>
    adminGet(
      "/api/admin/audit-log?action=ops-settings.reward-compensation-presets.update&limit=5",
      signal,
    ),
  );
  const [draft, setDraft] = useState<RewardCompensationPreset[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // 서버 설정을 편집 draft 로 복사한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (data?.rewardCompensationPresets) setDraft(data.rewardCompensationPresets);
  }, [data]);
  useEffect(() => {
    if (error) showToast(`프리셋 조회 실패: ${error}`);
  }, [error, showToast]);

  const save = async () => {
    setSaving(true);
    try {
      const saved = await adminPost<{
        rewardCompensationPresets: RewardCompensationPreset[];
      }>("/api/admin/ops-settings", { rewardCompensationPresets: draft });
      setDraft(saved.rewardCompensationPresets);
      showToast("보상 보정 프리셋 저장됨");
      void refetch();
    } catch (e) {
      showToast(`저장 실패: ${e instanceof Error ? e.message : "오류"}`);
    } finally {
      setSaving(false);
    }
  };

  const update = (id: string, patch: Partial<RewardCompensationPreset>) => {
    setDraft((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  return (
    <Panel title="보상 보정 프리셋 관리">
      {loading && draft.length === 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">불러오는 중...</p>
      ) : (
        <div className="space-y-2">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-zinc-500 dark:text-zinc-400">
                <tr>
                  <th className="py-1 pr-2 font-medium">이름</th>
                  <th className="py-1 pr-2 font-medium">종류</th>
                  <th className="py-1 pr-2 font-medium">itemId</th>
                  <th className="py-1 pr-2 font-medium">수량</th>
                  <th className="py-1 pr-2 font-medium">사유</th>
                  <th className="py-1 pr-2 font-medium">삭제</th>
                </tr>
              </thead>
              <tbody>
                {draft.map((preset) => (
                  <tr key={preset.id} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="py-1 pr-2">
                      <InlineInput
                        value={preset.label}
                        onChange={(label) => update(preset.id, { label })}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <select
                        value={preset.itemKind}
                        onChange={(e) =>
                          update(preset.id, {
                            itemKind: e.target.value as RewardCompensationPreset["itemKind"],
                          })
                        }
                        className="w-full rounded border border-zinc-300 bg-white px-1.5 py-1 dark:border-zinc-700 dark:bg-zinc-950"
                      >
                        {COMP_KIND_OPTIONS.map((kind) => (
                          <option key={kind} value={kind}>
                            {kind}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1 pr-2">
                      <InlineInput
                        value={preset.itemId}
                        onChange={(itemId) => update(preset.id, { itemId })}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        type="number"
                        min={1}
                        value={preset.quantity}
                        onChange={(e) =>
                          update(preset.id, {
                            quantity: Math.max(1, Math.floor(Number(e.target.value) || 1)),
                          })
                        }
                        className="w-24 rounded border border-zinc-300 bg-white px-1.5 py-1 dark:border-zinc-700 dark:bg-zinc-950"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <InlineInput
                        value={preset.reason}
                        onChange={(reason) => update(preset.id, { reason })}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <Button
                        onClick={() =>
                          setDraft((prev) => prev.filter((row) => row.id !== preset.id))
                        }
                      >
                        삭제
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              onClick={() =>
                setDraft((prev) => [
                  ...prev,
                  {
                    id: `preset-${Date.now().toString(36)}`,
                    label: "새 프리셋",
                    itemKind: "fishing_coin",
                    itemId: "",
                    quantity: 1,
                    reason: "보상 보정",
                  },
                ])
              }
            >
              추가
            </Button>
            <Button onClick={() => void save()} disabled={saving || draft.length === 0}>
              {saving ? "저장 중..." : "프리셋 저장"}
            </Button>
          </div>
          <div className="rounded-md border border-zinc-100 p-2 text-[11px] dark:border-zinc-800">
            <div className="text-zinc-500 dark:text-zinc-400">
              마지막 수정 {data?.rewardCompensationPresetsUpdatedByEmail ?? "-"} ·{" "}
              {data?.rewardCompensationPresetsUpdatedAt
                ? new Date(data.rewardCompensationPresetsUpdatedAt).toLocaleString("ko-KR")
                : "-"}
            </div>
            {auditData?.entries?.length ? (
              <ul className="mt-1 space-y-1">
                {auditData.entries.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap justify-between gap-2">
                    <span>{entry.adminEmail}</span>
                    <span className="text-zinc-500">
                      {new Date(entry.createdAt).toLocaleString("ko-KR")} ·{" "}
                      {Number(entry.detail?.count ?? 0).toLocaleString()}개
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      )}
    </Panel>
  );
}

function AlertThresholdPanel({
  value,
  suggested,
  onSaved,
}: {
  value: AlertThresholdSettings;
  suggested: AlertThresholdSettings;
  onSaved: () => void;
}) {
  const { showToast } = useAdmin();
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // 서버 설정을 편집 draft 로 복사한다. 이후 입력 중에는 draft 가 로컬 소스다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(value);
  }, [value]);

  const save = async () => {
    setSaving(true);
    try {
      await adminPost("/api/admin/ops-settings", { alertThresholds: draft });
      showToast("알림 임계치 저장됨");
      onSaved();
    } catch (e) {
      showToast(`저장 실패: ${e instanceof Error ? e.message : "오류"}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title="운영 알림 임계치">
      <div className="grid gap-2 md:grid-cols-4">
        <NumberField
          label="제한 5분"
          value={draft.abuseLast5m}
          onChange={(abuseLast5m) => setDraft({ ...draft, abuseLast5m })}
          max={100_000}
        />
        <NumberField
          label="제한 1시간"
          value={draft.abuseLast1h}
          onChange={(abuseLast1h) => setDraft({ ...draft, abuseLast1h })}
          max={100_000}
        />
        <NumberField
          label="보상 실패"
          value={draft.rewardFailures}
          onChange={(rewardFailures) => setDraft({ ...draft, rewardFailures })}
          max={100_000}
        />
        <NumberField
          label="대량 골드"
          value={draft.largeGoldEvents}
          onChange={(largeGoldEvents) => setDraft({ ...draft, largeGoldEvents })}
          max={100_000}
        />
        <NumberField
          label="관리자 변경"
          value={draft.adminAudit}
          onChange={(adminAudit) => setDraft({ ...draft, adminAudit })}
          max={100_000}
        />
        <NumberField
          label="동일 유저 이벤트"
          value={draft.repeatUserEvents}
          onChange={(repeatUserEvents) => setDraft({ ...draft, repeatUserEvents })}
          max={100_000}
        />
        <NumberField
          label="동일 IP 계정"
          value={draft.connectedIpUsers}
          onChange={(connectedIpUsers) => setDraft({ ...draft, connectedIpUsers })}
          max={100_000}
        />
        <NumberField
          label="상위 action"
          value={draft.topActionEvents}
          onChange={(topActionEvents) => setDraft({ ...draft, topActionEvents })}
          max={100_000}
        />
      </div>
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        <Button onClick={() => setDraft(suggested)} disabled={saving}>
          추천값 적용
        </Button>
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? "저장 중..." : "임계치 저장"}
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
        추천값: 5분 {suggested.abuseLast5m}, 1시간 {suggested.abuseLast1h}, 보상 실패{" "}
        {suggested.rewardFailures}, 대량 골드 {suggested.largeGoldEvents}, 관리자 변경{" "}
        {suggested.adminAudit}, 동일 유저 {suggested.repeatUserEvents}, 동일 IP{" "}
        {suggested.connectedIpUsers}, 상위 action {suggested.topActionEvents}
      </p>
    </Panel>
  );
}

function SanctionReportPanel({ report }: { report: Dashboard["sanctionReport"] }) {
  return (
    <Panel title="제재 만료·해제 리포트">
      <div className="grid gap-3 lg:grid-cols-2">
        <MiniSanctionList
          title="24시간 내 만료"
          rows={report.expiring24h.map((row) => ({
            key: row.id,
            name: row.gameName ?? row.userId.slice(0, 10),
            meta: `${row.type} · ${row.expiresAt ? new Date(row.expiresAt).toLocaleString("ko-KR") : "-"}`,
            reason: row.reason,
          }))}
        />
        <MiniSanctionList
          title="최근 해제"
          rows={report.lifted.map((row) => ({
            key: row.id,
            name: row.gameName ?? row.userId.slice(0, 10),
            meta: `${row.type} · ${row.liftedByEmail ?? "-"} · ${row.liftedAt ? new Date(row.liftedAt).toLocaleString("ko-KR") : "-"}`,
            reason: row.reason,
          }))}
        />
      </div>
    </Panel>
  );
}

function MiniSanctionList({
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

function AlertChannelsPanel({ value }: { value: Dashboard["alertChannels"] }) {
  const rows = [
    { key: "default", label: "기본", env: "OPS_ALERT_WEBHOOK_URL" },
    { key: "reward", label: "보상", env: "OPS_ALERT_REWARD_WEBHOOK_URL" },
    { key: "abuse", label: "이상 행동", env: "OPS_ALERT_ABUSE_WEBHOOK_URL" },
    { key: "economy", label: "경제", env: "OPS_ALERT_ECONOMY_WEBHOOK_URL" },
    { key: "deploy", label: "배포", env: "OPS_ALERT_DEPLOY_WEBHOOK_URL" },
  ] as const;
  const missing = rows.filter((row) => !value[row.key]);
  return (
    <Panel title="운영 알림 채널">
      <div className="grid gap-2 md:grid-cols-5">
        {rows.map((row) => (
          <div
            key={row.key}
            className="rounded-md border border-zinc-100 px-2 py-1.5 text-xs dark:border-zinc-800"
          >
            <div className="font-medium">{row.label}</div>
            <div className={value[row.key] ? "text-emerald-600" : "text-zinc-500"}>
              {value[row.key] ? "설정됨" : "미설정"}
            </div>
            <div className="mt-0.5 truncate font-mono text-[10px] text-zinc-400">
              {row.env}
            </div>
          </div>
        ))}
      </div>
      {missing.length > 0 ? (
        <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
          미설정 채널: {missing.map((row) => row.env).join(", ")}. 미설정 채널은 기본 웹훅으로 대체되거나 알림 이력에 skipped로 남습니다.
        </p>
      ) : null}
    </Panel>
  );
}

function OpsChangeHistoryPanel({ rows }: { rows: Dashboard["opsChangeHistory"] }) {
  return (
    <Panel title="운영 변경 이력">
      {rows.length === 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">최근 변경 없음</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-zinc-500 dark:text-zinc-400">
              <tr>
                <th className="py-1 pr-3 font-medium">시각</th>
                <th className="py-1 pr-3 font-medium">작업</th>
                <th className="hidden py-1 pr-3 font-medium md:table-cell">대상</th>
                <th className="py-1 pr-3 font-medium">관리자</th>
                <th className="hidden py-1 pr-3 font-medium md:table-cell">요약</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="whitespace-nowrap py-1 pr-3 text-zinc-500">
                    {new Date(row.createdAt).toLocaleString("ko-KR")}
                  </td>
                  <td className="py-1 pr-3 font-mono">{row.action}</td>
                  <td className="hidden py-1 pr-3 font-mono text-zinc-500 md:table-cell">
                    {row.targetUserId?.slice(0, 12) ?? "-"}
                  </td>
                  <td className="py-1 pr-3">{row.adminEmail}</td>
                  <td className="hidden py-1 pr-3 text-zinc-500 md:table-cell">
                    {row.summary || "-"}
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

function AlertHistoryPanel({ rows }: { rows: AlertHistoryEntry[] }) {
  return (
    <Panel title="운영 알림 이력">
      {rows.length === 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">이력 없음</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-zinc-500 dark:text-zinc-400">
              <tr>
                <th className="py-1 pr-3 font-medium">시각</th>
                <th className="py-1 pr-3 font-medium">상태</th>
                <th className="py-1 pr-3 font-medium">메시지</th>
                <th className="py-1 pr-3 font-medium">오류</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="whitespace-nowrap py-1 pr-3 text-zinc-500">
                    {new Date(row.createdAt).toLocaleString("ko-KR")}
                  </td>
                  <td className="py-1 pr-3 font-mono">{row.status}</td>
                  <td className="py-1 pr-3">{row.message}</td>
                  <td className="py-1 pr-3 text-zinc-500">{row.error ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function HotTimePanel() {
  const { showToast } = useAdmin();
  const { data, loading, error, refetch } = useAsyncData<{
    hotTime: HotTimeSettings;
    hotTimeSchedules: HotTimeSchedule[];
    updatedByEmail: string | null;
    updatedAt: string | null;
  }>((signal) => adminGet("/api/admin/ops-settings", signal));
  const [draft, setDraft] = useState<HotTimeSettings | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<HotTimeSchedule[]>([]);
  const [saving, setSaving] = useState(false);
  const value = draft ?? data?.hotTime ?? null;
  const conflicts = value ? hotTimeConflicts(value, scheduleDraft) : [];
  const preview = value ? hotTimePreview(value, scheduleDraft) : [];

  useEffect(() => {
    // 서버 설정을 편집 draft 로 복사한다. 이후 입력 중에는 draft 가 로컬 소스다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (data?.hotTime) setDraft(data.hotTime);
    if (data?.hotTimeSchedules) setScheduleDraft(data.hotTimeSchedules);
  }, [data]);

  useEffect(() => {
    if (error) showToast(`핫타임 조회 실패: ${error}`);
  }, [error, showToast]);

  const save = async () => {
    if (!value) return;
    setSaving(true);
    try {
      const saved = await adminPost<{ hotTime: HotTimeSettings }>(
        "/api/admin/ops-settings",
        { hotTime: value },
      );
      setDraft(saved.hotTime);
      showToast("핫타임 설정 저장됨");
      void refetch();
    } catch (e) {
      showToast(`저장 실패: ${e instanceof Error ? e.message : "오류"}`);
    } finally {
      setSaving(false);
    }
  };

  const saveSchedules = async () => {
    setSaving(true);
    try {
      const saved = await adminPost<{ hotTimeSchedules: HotTimeSchedule[] }>(
        "/api/admin/ops-settings",
        { hotTimeSchedules: scheduleDraft },
      );
      setScheduleDraft(saved.hotTimeSchedules);
      showToast("핫타임 반복 예약 저장됨");
      void refetch();
    } catch (e) {
      showToast(`저장 실패: ${e instanceof Error ? e.message : "오류"}`);
    } finally {
      setSaving(false);
    }
  };

  const addSchedule = () => {
    setScheduleDraft((prev) => [
      ...prev,
      {
        id: `schedule-${Date.now().toString(36)}`,
        enabled: true,
        title: "반복 핫타임",
        days: [6, 0],
        startsAt: "20:00",
        endsAt: "22:00",
        bonuses: {
          goldPct: 20,
          expPct: 20,
          masteryPct: 20,
          fishingCoinPct: 20,
        },
        note: "",
      },
    ]);
  };

  return (
    <Panel title="이벤트·핫타임 설정">
      {!value ? (
        <p className="text-xs text-zinc-500">
          {loading ? "불러오는 중..." : "설정 없음"}
        </p>
      ) : (
        <div className="space-y-2 text-xs">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={value.enabled}
              onChange={(e) =>
                setDraft({ ...value, enabled: e.target.checked })
              }
            />
            <span>활성화</span>
          </label>
          <div className="grid gap-2 md:grid-cols-3">
            <TextField
              label="제목"
              value={value.title}
              onChange={(title) => setDraft({ ...value, title })}
            />
            <TextField
              label="시작"
              type="datetime-local"
              value={toLocalInput(value.startsAt)}
              onChange={(startsAt) => setDraft({ ...value, startsAt })}
            />
            <TextField
              label="종료"
              type="datetime-local"
              value={toLocalInput(value.endsAt)}
              onChange={(endsAt) => setDraft({ ...value, endsAt })}
            />
            <NumberField
              label="골드 %"
              value={value.bonuses.goldPct}
              onChange={(goldPct) =>
                setDraft({ ...value, bonuses: { ...value.bonuses, goldPct } })
              }
            />
            <NumberField
              label="경험치 %"
              value={value.bonuses.expPct}
              onChange={(expPct) =>
                setDraft({ ...value, bonuses: { ...value.bonuses, expPct } })
              }
            />
            <NumberField
              label="숙련 %"
              value={value.bonuses.masteryPct}
              onChange={(masteryPct) =>
                setDraft({ ...value, bonuses: { ...value.bonuses, masteryPct } })
              }
            />
            <NumberField
              label="낚시 코인 %"
              value={value.bonuses.fishingCoinPct}
              onChange={(fishingCoinPct) =>
                setDraft({
                  ...value,
                  bonuses: { ...value.bonuses, fishingCoinPct },
                })
              }
            />
          </div>
          <TextField
            label="메모"
            value={value.note}
            onChange={(note) => setDraft({ ...value, note })}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-zinc-500">
              마지막 수정 {data?.updatedByEmail ?? "-"} ·{" "}
              {data?.updatedAt ? new Date(data.updatedAt).toLocaleString("ko-KR") : "-"}
            </span>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "저장 중..." : "설정 저장"}
            </Button>
          </div>
          <div className="mt-4 border-t border-zinc-100 pt-3 dark:border-zinc-800">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h5 className="text-xs font-semibold">반복 예약</h5>
              <Button onClick={addSchedule}>예약 추가</Button>
            </div>
            <HotTimePreview rows={preview} />
            {scheduleDraft.length === 0 ? (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">예약 없음</p>
            ) : (
              <div className="space-y-2">
                {conflicts.length > 0 ? (
                  <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    {conflicts.map((message) => (
                      <div key={message}>{message}</div>
                    ))}
                  </div>
                ) : null}
                {scheduleDraft.map((schedule, index) => (
                  <ScheduleEditor
                    key={schedule.id}
                    value={schedule}
                    onChange={(next) =>
                      setScheduleDraft((prev) =>
                        prev.map((row) => (row.id === schedule.id ? next : row)),
                      )
                    }
                    onRemove={() =>
                      setScheduleDraft((prev) => prev.filter((row) => row.id !== schedule.id))
                    }
                    index={index}
                  />
                ))}
                <div className="flex justify-end">
                  <Button onClick={() => void saveSchedules()} disabled={saving}>
                    {saving ? "저장 중..." : "반복 예약 저장"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

function hotTimeConflicts(
  hotTime: HotTimeSettings,
  schedules: HotTimeSchedule[],
): string[] {
  const active = schedules.filter((row) => row.enabled);
  const messages: string[] = [];
  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const overlapDays = active[i].days.filter((day) => active[j].days.includes(day));
      if (overlapDays.length > 0 && timeOverlaps(active[i], active[j])) {
        messages.push(
          `반복 예약 겹침: ${active[i].title || active[i].id} / ${active[j].title || active[j].id} (${overlapDays.map((day) => DAY_LABELS[day]).join(", ")})`,
        );
      }
    }
  }
  if (isManualHotTimeValid(hotTime)) {
    const start = new Date(hotTime.startsAt);
    const end = new Date(hotTime.endsAt);
    for (const schedule of active) {
      if (manualOverlapsSchedule(start, end, schedule)) {
        messages.push(`단발 핫타임과 반복 예약 겹침: ${schedule.title || schedule.id}`);
      }
    }
  }
  return messages.slice(0, 5);
}

function hotTimePreview(
  hotTime: HotTimeSettings,
  schedules: HotTimeSchedule[],
) {
  const now = Date.now();
  const until = now + 7 * 24 * 60 * 60 * 1000;
  const rows: Array<{
    source: "manual" | "schedule";
    title: string;
    startsAt: string;
    endsAt: string;
    bonuses: HotTimeSettings["bonuses"];
    conflict?: boolean;
  }> = [];
  if (isManualHotTimeValid(hotTime)) {
    const start = Date.parse(hotTime.startsAt);
    const end = Date.parse(hotTime.endsAt);
    if (end > now && start < until) {
      rows.push({
        source: "manual",
        title: hotTime.title,
        startsAt: new Date(start).toISOString(),
        endsAt: new Date(end).toISOString(),
        bonuses: hotTime.bonuses,
      });
    }
  }
  const startDayKst = new Date(now + 9 * 60 * 60 * 1000);
  startDayKst.setUTCHours(0, 0, 0, 0);
  for (let offset = 0; offset < 7; offset += 1) {
    const day = new Date(startDayKst);
    day.setUTCDate(day.getUTCDate() + offset);
    const dayOfWeek = day.getUTCDay();
    const datePart = day.toISOString().slice(0, 10);
    for (const schedule of schedules) {
      if (!schedule.enabled || !schedule.days.includes(dayOfWeek)) continue;
      const start = Date.parse(`${datePart}T${schedule.startsAt}:00+09:00`);
      const end = Date.parse(`${datePart}T${schedule.endsAt}:00+09:00`);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) continue;
      if (end <= now || start >= until) continue;
      rows.push({
        source: "schedule",
        title: schedule.title,
        startsAt: new Date(start).toISOString(),
        endsAt: new Date(end).toISOString(),
        bonuses: schedule.bonuses,
      });
    }
  }
  const sorted = rows.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  return sorted
    .map((row, index) => ({
      ...row,
      conflict: sorted.some(
        (other, otherIndex) =>
          otherIndex !== index &&
          Date.parse(row.startsAt) < Date.parse(other.endsAt) &&
          Date.parse(other.startsAt) < Date.parse(row.endsAt),
      ),
    }))
    .slice(0, 20);
}

function HotTimePreview({
  rows,
}: {
  rows: ReturnType<typeof hotTimePreview>;
}) {
  return (
    <div className="mb-2 rounded-md border border-zinc-100 p-2 dark:border-zinc-800">
      <div className="mb-1 text-[11px] font-medium text-zinc-500">7일 미리보기</div>
      {rows.length === 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">예정 없음</p>
      ) : (
        <ul className="grid gap-1 text-[11px] md:grid-cols-2">
          {rows.map((row) => (
            <li
              key={`${row.source}:${row.startsAt}:${row.title}`}
              className="rounded border border-zinc-100 px-2 py-1 dark:border-zinc-800"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{row.title || "핫타임"}</span>
                {row.conflict ? (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                    충돌
                  </span>
                ) : null}
              </div>
              <div className="text-zinc-500">
                {new Date(row.startsAt).toLocaleString("ko-KR")} -{" "}
                {new Date(row.endsAt).toLocaleTimeString("ko-KR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
              <div className="text-zinc-500">
                {row.source === "manual" ? "단발" : "반복"} · 골드 {row.bonuses.goldPct}% ·
                경험치 {row.bonuses.expPct}% · 숙련 {row.bonuses.masteryPct}%
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function isManualHotTimeValid(hotTime: HotTimeSettings) {
  const start = Date.parse(hotTime.startsAt);
  const end = Date.parse(hotTime.endsAt);
  return hotTime.enabled && Number.isFinite(start) && Number.isFinite(end) && start < end;
}

function timeOverlaps(a: HotTimeSchedule, b: HotTimeSchedule) {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

function manualOverlapsSchedule(start: Date, end: Date, schedule: HotTimeSchedule) {
  const cursor = new Date(start);
  cursor.setUTCHours(0, 0, 0, 0);
  while (cursor.getTime() < end.getTime()) {
    const kst = new Date(cursor.getTime() + 9 * 60 * 60 * 1000);
    const day = kst.getUTCDay();
    if (schedule.days.includes(day)) {
      const datePart = kst.toISOString().slice(0, 10);
      const scheduledStart = Date.parse(`${datePart}T${schedule.startsAt}:00+09:00`);
      const scheduledEnd = Date.parse(`${datePart}T${schedule.endsAt}:00+09:00`);
      if (start.getTime() < scheduledEnd && scheduledStart < end.getTime()) return true;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return false;
}

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function ScheduleEditor({
  value,
  onChange,
  onRemove,
  index,
}: {
  value: HotTimeSchedule;
  onChange: (value: HotTimeSchedule) => void;
  onRemove: () => void;
  index: number;
}) {
  const setBonus = (
    key: keyof HotTimeSettings["bonuses"],
    next: number,
  ) => {
    onChange({ ...value, bonuses: { ...value.bonuses, [key]: next } });
  };
  const toggleDay = (day: number) => {
    const days = value.days.includes(day)
      ? value.days.filter((value) => value !== day)
      : [...value.days, day].sort((a, b) => a - b);
    onChange({ ...value, days });
  };

  return (
    <div className="rounded-md border border-zinc-100 p-2 dark:border-zinc-800">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <label className="inline-flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
          />
          <span>예약 {index + 1} 활성화</span>
        </label>
        <Button onClick={onRemove}>삭제</Button>
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        <TextField
          label="제목"
          value={value.title}
          onChange={(title) => onChange({ ...value, title })}
        />
        <TextField
          label="시작 시각(KST)"
          type="time"
          value={value.startsAt}
          onChange={(startsAt) => onChange({ ...value, startsAt })}
        />
        <TextField
          label="종료 시각(KST)"
          type="time"
          value={value.endsAt}
          onChange={(endsAt) => onChange({ ...value, endsAt })}
        />
        <NumberField
          label="골드 %"
          value={value.bonuses.goldPct}
          onChange={(next) => setBonus("goldPct", next)}
        />
        <NumberField
          label="경험치 %"
          value={value.bonuses.expPct}
          onChange={(next) => setBonus("expPct", next)}
        />
        <NumberField
          label="숙련 %"
          value={value.bonuses.masteryPct}
          onChange={(next) => setBonus("masteryPct", next)}
        />
        <NumberField
          label="낚시 코인 %"
          value={value.bonuses.fishingCoinPct}
          onChange={(next) => setBonus("fishingCoinPct", next)}
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {DAY_LABELS.map((label, day) => (
          <button
            key={label}
            type="button"
            onClick={() => toggleDay(day)}
            className={
              value.days.includes(day)
                ? "rounded border border-zinc-900 bg-zinc-900 px-2 py-1 text-[11px] text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                : "rounded border border-zinc-300 bg-white px-2 py-1 text-[11px] dark:border-zinc-700 dark:bg-zinc-900"
            }
          >
            {label}
          </button>
        ))}
      </div>
      <TextField
        label="메모"
        value={value.note}
        onChange={(note) => onChange({ ...value, note })}
      />
    </div>
  );
}

function AlertCard({
  level,
  title,
  message,
}: {
  level: "danger" | "warning" | "info";
  title: string;
  message: string;
}) {
  const tone =
    level === "danger"
      ? "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
      : level === "warning"
        ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        : "border-zinc-200 bg-white text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200";
  return (
    <div className={`rounded-md border px-3 py-2 text-xs ${tone}`}>
      <div className="font-semibold">{title}</div>
      <div className="mt-0.5">{message}</div>
    </div>
  );
}

function toneClass(level: "danger" | "warning" | "info") {
  return level === "danger"
    ? "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
    : level === "warning"
      ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
      : "border-zinc-200 bg-white text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200";
}

function classificationClass(tone: "danger" | "warning" | "info") {
  return tone === "danger"
    ? "inline-flex rounded bg-red-50 px-1.5 py-0.5 text-[11px] text-red-700 dark:bg-red-950/40 dark:text-red-300"
    : tone === "warning"
      ? "inline-flex rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
      : "inline-flex rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
}

function statusLabel(status: RewardFailureStatus) {
  if (status === "compensated") return "보정 완료";
  if (status === "ignored") return "제외";
  return "검토 완료";
}

function formatDelta(value: number) {
  if (value === 0) return "0";
  return `${value > 0 ? "+" : ""}${value.toLocaleString()}`;
}

function deltaClass(value: number) {
  if (value > 0) return "text-amber-700 dark:text-amber-300";
  if (value < 0) return "text-emerald-700 dark:text-emerald-300";
  return "text-zinc-500";
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value.toLocaleString()}</div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "datetime-local" | "time";
}) {
  return (
    <label className="space-y-1 text-xs">
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
      />
    </label>
  );
}

function InlineInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full min-w-32 rounded border border-zinc-300 bg-white px-1.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950"
    />
  );
}

function NumberField({
  label,
  value,
  onChange,
  max = 500,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  max?: number;
}) {
  return (
    <label className="space-y-1 text-xs">
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
      <input
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(e) =>
          onChange(Math.min(max, Math.max(0, Math.floor(Number(e.target.value) || 0))))
        }
        className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
      />
    </label>
  );
}

function toLocalInput(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const offsetMs = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 16);
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details
      open
      className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <summary className="cursor-pointer select-none text-xs font-semibold marker:text-zinc-400">
        {title}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

function CountList({ rows, empty }: { rows: CountRow[]; empty: string }) {
  if (rows.length === 0) {
    return <p className="text-xs text-zinc-500 dark:text-zinc-400">{empty}</p>;
  }
  return (
    <ul className="space-y-1 text-xs">
      {rows.map((row) => (
        <li key={row.key} className="flex items-center justify-between gap-3">
          <span className="min-w-0 truncate font-mono">{row.key}</span>
          <span className="shrink-0 tabular-nums text-zinc-500">{row.count.toLocaleString()}</span>
        </li>
      ))}
    </ul>
  );
}

function MiniList({ title, rows }: { title: string; rows: CountRow[] }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium text-zinc-500">{title}</div>
      <CountList rows={rows} empty="없음" />
    </div>
  );
}
