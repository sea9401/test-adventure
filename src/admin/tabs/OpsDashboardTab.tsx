"use client";

import { useAdmin } from "@/admin/AdminContext";
import { adminGet, adminPost } from "@/admin/api";
import { abuseActionLabel } from "@/admin/displayLabels";
import { economyEventLabel } from "@/admin/economyLabels";
import { HotTimePanel } from "./OpsDashboardHotTime";
import {
  CompensationOverviewPanel,
  CompensationPresetPanel,
  RewardFailurePanel,
  RewardFailureStatusPanel,
} from "./OpsDashboardRewards";
import {
  OpsAlertDetail,
  RecentSuspicionEvents,
  RiskEventsPanel,
  SanctionRecommendationPanel,
  SanctionReportPanel,
  SuspicionMetric,
} from "./OpsDashboardRisk";
import {
  AlertChannelsPanel,
  AlertHistoryPanel,
  AlertThresholdPanel,
  LifeFieldFeaturePanel,
  OpsChangeHistoryPanel,
} from "./OpsDashboardSettings";
import { DailyReportPanel, OpsSummaryPanel, PeriodComparisonPanel } from "./OpsDashboardSummary";
import { type Dashboard } from "./opsDashboardTypes";
import {
  AlertCard,
  CountList,
  formatIntervalSec,
  Metric,
  MiniList,
  Panel,
  slowQueryLabel,
  slowQueryStatusLabel,
  suspicionClass,
  suspicionLabel,
} from "./OpsDashboardUi";
import { AdminUserLink } from "@/admin/ui/AdminUserLink";
import { Button } from "@/admin/ui/Field";
import { useAdminUserDirectory } from "@/admin/useAdminUserDirectory";
import { useAsyncData } from "@/lib/useAsyncData";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export function OpsDashboardTab() {
  const { showToast } = useAdmin();
  const [hours, setHours] = useState(24);
  const { data, loading, error, refetch } = useAsyncData<{ ok: true } & Dashboard>(
    (signal) => adminGet(`/api/admin/ops-dashboard?hours=${hours}`, signal),
    [hours],
  );
  const [testingWebhook, setTestingWebhook] = useState(false);
  const visibleUserIds = useMemo(() => {
    if (!data) return [];
    return [
      ...data.suspiciousUsers.map((row) => row.userId),
      ...data.sanctionRecommendations.map((row) => row.userId),
      ...data.connectedIps.flatMap((row) => row.userIds),
      ...data.rewardFailureCandidates.map((row) => row.userId),
      ...data.opsChangeHistory.map((row) => row.targetUserId),
      ...data.abuse.topUsers.map((row) => row.key),
    ];
  }, [data]);
  const userDirectory = useAdminUserDirectory(visibleUserIds);

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
            aria-label="운영 현황 조회 기간"
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
                >
                  {alert.detail ? (
                    <OpsAlertDetail
                      alert={alert}
                      data={data}
                      userDirectory={userDirectory}
                    />
                  ) : null}
                </AlertCard>
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
              <CountList
                rows={data.abuse.topActions}
                empty="행동 없음"
                labelKey={abuseActionLabel}
              />
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <MiniList title="IP" rows={data.abuse.topIps} />
                <MiniList
                  title="유저"
                  rows={data.abuse.topUsers.map((row) => ({
                    ...row,
                    key:
                      userDirectory[row.key]?.gameName ??
                      userDirectory[row.key]?.email ??
                      `유저 ${row.key.slice(0, 8)}`,
                  }))}
                />
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
              <CountList
                rows={data.economy.topEvents}
                empty="이벤트 없음"
                labelKey={economyEventLabel}
              />
              {data.economy.topRewardFailures.length > 0 ? (
                <div className="mt-2">
                  <MiniList
                    title="보상 실패"
                    rows={data.economy.topRewardFailures}
                    labelKey={economyEventLabel}
                  />
                </div>
              ) : null}
            </Panel>
          </div>

          <Panel title="느린 쿼리 후보">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-zinc-500 dark:text-zinc-400">
                  <tr>
                    <th className="py-1 pr-3 font-medium">대상</th>
                    <th className="py-1 pr-3 font-medium">상태</th>
                    <th className="py-1 pr-3 font-medium">TTL</th>
                    <th className="py-1 pr-3 font-medium">메모</th>
                  </tr>
                </thead>
                <tbody>
                  {data.slowQueryCandidates.map((row) => (
                    <tr key={row.key} className="border-t border-zinc-100 dark:border-zinc-800">
                      <td className="py-1 pr-3">{slowQueryLabel(row.key)}</td>
                      <td className="py-1 pr-3">{slowQueryStatusLabel(row.status)}</td>
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
                      <th className="py-1 pr-3 font-medium">유저</th>
                      <th className="py-1 pr-3 font-medium">점수</th>
                      <th className="py-1 pr-3 font-medium">단계</th>
                      <th className="py-1 pr-3 font-medium">제한</th>
                      <th className="py-1 pr-3 font-medium">이벤트</th>
                      <th className="hidden py-1 pr-3 font-medium md:table-cell">행동/IP</th>
                      <th className="py-1 pr-3 font-medium">탐지 상세</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.suspiciousUsers.map((row) => (
                      <tr key={row.userId} className="border-t border-zinc-100 dark:border-zinc-800">
                        <td className="py-1 pr-3">
                          <AdminUserLink
                            userId={row.userId}
                            gameName={userDirectory[row.userId]?.gameName}
                            email={userDirectory[row.userId]?.email}
                          />
                        </td>
                        <td className="py-1 pr-3 tabular-nums">{row.score}</td>
                        <td className="py-1 pr-3">
                          <span className={`rounded px-1.5 py-0.5 text-[11px] ${suspicionClass(row.severity)}`}>
                            {suspicionLabel(row.severity)}
                          </span>
                        </td>
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
                        <td className="min-w-[360px] py-2 pr-3 align-top text-zinc-600 dark:text-zinc-300">
                          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px]">
                            <span className="font-medium text-zinc-700 dark:text-zinc-200">최근 발생</span>
                            <span>{new Date(row.lastAt).toLocaleString("ko-KR")}</span>
                          </div>

                          <div className="mt-2">
                            <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                              탐지 요약
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {row.topActions.length > 0 ? (
                                row.topActions.map((action) => (
                                  <span
                                    key={action.key}
                                    className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                                  >
                                    {abuseActionLabel(action.key)}{" "}
                                    <strong className="tabular-nums">{action.count.toLocaleString()}</strong>
                                  </span>
                                ))
                              ) : (
                                <span className="text-[11px] text-zinc-400">탐지 내역 없음</span>
                              )}
                            </div>
                          </div>

                          <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px]">
                            <SuspicionMetric
                              label="보상 실패"
                              value={`${row.rewardFailures.toLocaleString()}건`}
                            />
                            <SuspicionMetric
                              label="평균 간격"
                              value={formatIntervalSec(row.avgIntervalSec)}
                            />
                          </div>

                          <details className="group mt-2 hidden rounded border border-zinc-200 bg-zinc-50/70 md:block dark:border-zinc-700 dark:bg-zinc-900/40">
                            <summary className="cursor-pointer list-none px-2 py-1.5 text-[11px] font-medium text-zinc-700 marker:hidden dark:text-zinc-200">
                              최근 이벤트 {row.recentEvents.length.toLocaleString()}건{" "}
                              <span className="text-zinc-400 group-open:hidden">펼쳐보기</span>
                              <span className="hidden text-zinc-400 group-open:inline">접기</span>
                            </summary>
                            <RecentSuspicionEvents events={row.recentEvents} />
                          </details>
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
                      <th className="py-1 pr-3 font-medium">연결 유저</th>
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
                        <td className="py-1 pr-3 text-[11px] text-zinc-500">
                          <div className="flex flex-wrap gap-x-2 gap-y-1">
                            {row.userIds.map((id) => (
                              <AdminUserLink
                                key={id}
                                userId={id}
                                gameName={userDirectory[id]?.gameName}
                                email={userDirectory[id]?.email}
                                compact
                              />
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <SanctionRecommendationPanel rows={data.sanctionRecommendations} userDirectory={userDirectory} />
          <RewardFailurePanel rows={data.rewardFailureCandidates} onDone={refetch} userDirectory={userDirectory} />
          <RewardFailureStatusPanel rows={data.rewardFailureStatusRecent} onDone={refetch} />
          <CompensationPresetPanel />

          <AlertThresholdPanel
            value={data.alertThresholds}
            suggested={data.suggestedAlertThresholds}
            onSaved={refetch}
          />
          <SanctionReportPanel report={data.sanctionReport} />
          <AlertChannelsPanel value={data.alertChannels} />
          <OpsChangeHistoryPanel rows={data.opsChangeHistory} userDirectory={userDirectory} />
          <AlertHistoryPanel rows={data.alertHistory} />
          <LifeFieldFeaturePanel />
          <HotTimePanel />
        </>
      )}
    </section>
  );
}
