"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { adminGet } from "../../api";
import { Button } from "../../ui/Field";
import {
  economyEventLabel,
  economyItemLabel,
} from "../../economyLabels";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import type {
  AccountEconomyTraceReport,
  EconomyTraceDays,
} from "@/lib/server/accountEconomyTrace";

export function AccountEconomyTracePanel({ initialUser = "" }: { initialUser?: string }) {
  const [user, setUser] = useState(initialUser);
  const [days, setDays] = useState<EconomyTraceDays>(30);
  const [report, setReport] = useState<AccountEconomyTraceReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (targetUser: string, targetDays: EconomyTraceDays) => {
    const query = targetUser.trim();
    if (!query) {
      setError("닉네임 또는 유저 ID를 입력해 주세요.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await adminGet<{
        ok: true;
        report: AccountEconomyTraceReport;
      }>(
        `/api/admin/economy-trace?user=${encodeURIComponent(query)}&days=${targetDays}`,
      );
      setReport(response.report);
    } catch (cause) {
      setReport(null);
      setError(
        cause instanceof Error && cause.message === "HTTP 404"
          ? "일치하는 계정을 찾지 못했습니다. 닉네임은 정확히 입력해 주세요."
          : "재화 흐름을 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialUser.trim()) return;
    const timeoutId = window.setTimeout(() => void load(initialUser, 30), 0);
    return () => window.clearTimeout(timeoutId);
  }, [initialUser, load]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void load(user, days);
  }

  return (
    <section className={`${SURFACE_CARD} p-4`}>
      <div>
        <h3 className="text-sm font-semibold">계정 재화 흐름 분석</h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          정확한 닉네임 또는 유저 ID로 생산량, 현재 보유량, 거래 상대와 길드 창고
          이동을 함께 조회합니다.
        </p>
      </div>

      <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-2">
        <label className="min-w-60 flex-1 space-y-1 text-xs">
          <span className="text-zinc-500 dark:text-zinc-400">닉네임 또는 유저 ID</span>
          <input
            value={user}
            onChange={(event) => setUser(event.target.value)}
            placeholder="정확한 닉네임 또는 유저 ID"
            className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-zinc-500 dark:text-zinc-400">조회 기간</span>
          <select
            value={days}
            onChange={(event) => setDays(Number(event.target.value) as EconomyTraceDays)}
            className="block rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            <option value={7}>최근 7일</option>
            <option value={30}>최근 30일</option>
            <option value={90}>최근 90일</option>
          </select>
        </label>
        <Button type="submit" disabled={loading}>
          {loading ? "분석 중…" : "분석"}
        </Button>
      </form>

      {error ? (
        <p role="alert" className="mt-3 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
      {report ? (
        <div className="mt-4">
          <AccountEconomyTraceReportView report={report} />
        </div>
      ) : null}
    </section>
  );
}

export function AccountEconomyTraceReportView({
  report,
}: {
  report: AccountEconomyTraceReport;
}) {
  const anyDirectMovement =
    report.evidence.materialMarketplaceTransfer ||
    report.evidence.guildWarehouseDeposit;

  return (
    <div className="space-y-3">
      <div className={`${SURFACE_INSET} flex flex-wrap items-start justify-between gap-3 p-3`}>
        <div>
          <p className="text-sm font-semibold">{report.account.gameName}</p>
          <p className="font-mono text-[10px] text-zinc-500">{report.account.userId}</p>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            길드: {report.account.guildName ?? "무소속"}
            {report.account.guildRole ? ` · ${report.account.guildRole}` : ""}
          </p>
        </div>
        <div className="text-right text-xs text-zinc-500 dark:text-zinc-400">
          <p>최근 {report.period.days}일</p>
          <p>{formatDate(report.period.since)} ~ {formatDate(report.period.until)}</p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="총 생산량" value={report.production.totalQuantity} />
        <Metric label="현재 골드" value={report.current.gold} />
        <Metric label="은행 골드" value={report.current.bankedGold} />
        <div className={`${SURFACE_INSET} p-3`}>
          <p className="text-[11px] text-zinc-500">직접 이동 근거</p>
          <p className={`mt-1 text-xs font-semibold ${anyDirectMovement ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-600 dark:text-zinc-400"}`}>
            {anyDirectMovement ? "직접 이동 기록 있음" : "확인된 직접 이동 없음"}
          </p>
          <p className="mt-1 text-[10px] text-zinc-500">
            거래소 재료 판매 {yesNo(report.evidence.materialMarketplaceTransfer)} · 창고 입고{" "}
            {yesNo(report.evidence.guildWarehouseDeposit)}
          </p>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <ReportSection title="기간 내 생산">
          {report.production.items.length === 0 ? (
            <Empty>생산 기록 없음</Empty>
          ) : (
            <DataTable headers={["활동", "생산품", "수량", "횟수"]}>
              {report.production.items.map((row) => (
                <tr key={`${row.activity}:${row.itemKind}:${row.itemId}`} className="border-t border-zinc-200 dark:border-zinc-700">
                  <Cell>{activityLabel(row.activity)}</Cell>
                  <Cell>{row.itemName}</Cell>
                  <NumberCell>{row.quantity.toLocaleString()}</NumberCell>
                  <NumberCell>{row.events.toLocaleString()}</NumberCell>
                </tr>
              ))}
            </DataTable>
          )}
        </ReportSection>

        <ReportSection title="현재 보유 생산 재료">
          {report.current.productionMaterials.length === 0 ? (
            <Empty>현재 보유한 생산 재료 없음</Empty>
          ) : (
            <DataTable headers={["재료", "현재 수량"]}>
              {report.current.productionMaterials.map((row) => (
                <tr key={`${row.itemKind}:${row.itemId}`} className="border-t border-zinc-200 dark:border-zinc-700">
                  <Cell>{row.itemName}</Cell>
                  <NumberCell>{row.quantity.toLocaleString()}</NumberCell>
                </tr>
              ))}
            </DataTable>
          )}
        </ReportSection>

        <ReportSection title="거래소 직접 거래 상대">
          {report.marketplace.length === 0 ? (
            <Empty>거래 상대 기록 없음</Empty>
          ) : (
            <DataTable headers={["구분", "아이템", "수량", "상대", "골드"]}>
              {report.marketplace.map((row, index) => (
                <tr key={`${row.eventType}:${row.itemKind}:${row.itemId}:${row.counterpartyUserId}:${index}`} className="border-t border-zinc-200 dark:border-zinc-700">
                  <Cell>{row.direction === "sell" ? "판매" : "구매"}</Cell>
                  <Cell>{economyItemLabel(row.itemKind, row.itemId)}</Cell>
                  <NumberCell>{row.quantity.toLocaleString()}</NumberCell>
                  <Cell>
                    {row.counterpartyName ?? row.counterpartyUserId?.slice(0, 8) ?? "알 수 없음"}
                  </Cell>
                  <NumberCell>{signed(row.goldDelta)}</NumberCell>
                </tr>
              ))}
            </DataTable>
          )}
        </ReportSection>

        <ReportSection title="본인 길드 창고 이동">
          {report.guildWarehouse.length === 0 ? (
            <Empty>길드 창고 이동 없음</Empty>
          ) : (
            <DataTable headers={["구분", "아이템", "수량", "횟수"]}>
              {report.guildWarehouse.map((row, index) => (
                <tr key={`${row.direction}:${row.itemKind}:${row.itemId}:${index}`} className="border-t border-zinc-200 dark:border-zinc-700">
                  <Cell>{row.direction === "deposit" ? "길드 창고 입고" : "길드 창고 출고"}</Cell>
                  <Cell>{row.itemName ?? economyItemLabel(row.itemKind, row.itemId)}</Cell>
                  <NumberCell>{row.quantity.toLocaleString()}</NumberCell>
                  <NumberCell>{row.events.toLocaleString()}</NumberCell>
                </tr>
              ))}
            </DataTable>
          )}
        </ReportSection>
      </div>

      <ReportSection title="기간 내 주요 재화 사용·변동">
        {report.uses.length === 0 ? (
          <Empty>주요 사용 기록 없음</Empty>
        ) : (
          <DataTable headers={["이벤트", "아이템", "수량", "골드", "횟수"]}>
            {report.uses.map((row, index) => (
              <tr key={`${row.eventType}:${row.itemKind}:${row.itemId}:${index}`} className="border-t border-zinc-200 dark:border-zinc-700">
                <Cell>{economyEventLabel(row.eventType)}</Cell>
                <Cell>{economyItemLabel(row.itemKind, row.itemId)}</Cell>
                <NumberCell>{row.quantity.toLocaleString()}</NumberCell>
                <NumberCell>{signed(row.goldDelta)}</NumberCell>
                <NumberCell>{row.events.toLocaleString()}</NumberCell>
              </tr>
            ))}
          </DataTable>
        )}
      </ReportSection>

      <p className={`${SURFACE_INSET} p-3 text-[11px] leading-relaxed text-amber-800 dark:text-amber-300`}>
        추적 한계: {report.limitations}
      </p>
    </div>
  );
}

function ReportSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={`${SURFACE_INSET} overflow-hidden`}>
      <h4 className="px-3 pt-3 text-xs font-semibold">{title}</h4>
      <div className="p-3">{children}</div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className={`${SURFACE_INSET} p-3`}>
      <p className="text-[11px] text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value.toLocaleString()}</p>
    </div>
  );
}

function DataTable({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-zinc-500 dark:text-zinc-400">
          <tr>
            {headers.map((header) => (
              <th key={header} className="whitespace-nowrap px-2 py-1 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Cell({ children }: { children: ReactNode }) {
  return <td className="whitespace-nowrap px-2 py-1.5">{children}</td>;
}

function NumberCell({ children }: { children: ReactNode }) {
  return <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{children}</td>;
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-xs text-zinc-500 dark:text-zinc-400">{children}</p>;
}

function activityLabel(activity: string): string {
  if (activity === "woodcutting") return "벌목";
  if (activity === "mining") return "채광";
  if (activity === "farming") return "농사";
  if (activity === "fishing") return "낚시";
  return activity;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("ko-KR");
}

function signed(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toLocaleString()}`;
}

function yesNo(value: boolean): string {
  return value ? "있음" : "없음";
}
