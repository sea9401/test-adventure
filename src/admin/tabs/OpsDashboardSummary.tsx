"use client";

import { type DailyReport, type Dashboard } from "./opsDashboardTypes";
import { deltaClass, formatDelta, Metric, Panel } from "./OpsDashboardUi";

export function DailyReportPanel({
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


export function OpsSummaryPanel({ lines }: { lines: string[] }) {
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


export function PeriodComparisonPanel({
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
