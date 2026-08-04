"use client";

import { useCallback, useEffect, useState } from "react";
import { adminGet } from "../api";
import { Button } from "../ui/Field";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";

type MarketplaceEconomy = {
  ok: true;
  generatedAt: string;
  summary: {
    trades: number;
    volume: number;
    grossGold: number;
    taxGold: number;
    activeListings: number;
    activeBuyOrders: number;
    expiredActiveListings: number;
    expiredActiveBuyOrders: number;
    escrowGold: number;
  };
  daily: Array<{ date: string; trades: number; volume: number; grossGold: number; taxGold: number }>;
  popularItems: Array<{ itemId: string; trades: number; volume: number; grossGold: number }>;
  priceMovements: Array<{ itemId: string; currentUnitPrice: number; baselineUnitPrice: number; changePct: number }>;
  suspicious: Array<{
    kind:
      | "self_trade"
      | "repeated_pair"
      | "abnormal_price"
      | "same_ip_pair"
      | "floor_transfer";
    severity: "danger" | "warning";
    sellerId: string;
    buyerId: string;
    trades: number;
    grossGold: number;
    itemId?: string | null;
  }>;
  equipmentAudits: Array<{
    orderId: number;
    sellerId: string | null;
    buyerId: string | null;
    itemId: string | null;
    grossGold: number;
    minimumPrice: number;
    power: number | null;
    qualityPct: number | null;
    sameIp: boolean;
    nearFloor: boolean;
    repeatedPairTrades: number;
    riskScore: number;
    riskLevel: "normal" | "watch" | "review";
    riskReasons: string[];
    orderCreatedAt: string | null;
    createdAt: string;
    inboxCreatedAt: string | null;
    inboxClaimedAt: string | null;
    deliveryStatus: "pending" | "claimed" | "missing";
  }>;
  stalled: Array<{ type: "listing" | "buy_order"; itemId: string; itemName: string; quantity: number; expiresAt: string }>;
};

export function MarketplaceEconomyTab() {
  const [data, setData] = useState<MarketplaceEconomy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await adminGet<MarketplaceEconomy>("/api/admin/marketplace-economy"));
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 관리자 탭 진입 시 원격 집계 로드
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <section className={`${SURFACE_CARD} p-4`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">거래소 경제 현황</h3>
            <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              최근 30일 체결과 현재 주문을 집계합니다. 이상 거래는 기록·확인용이며 자동 제재하지 않습니다.
            </p>
          </div>
          <Button onClick={() => void load()} disabled={loading}>
            {loading ? "갱신 중…" : "새로고침"}
          </Button>
        </div>
        {error ? <p className="mt-3 text-xs text-rose-600 dark:text-rose-400">{error}</p> : null}
        {data ? (
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            <Metric label="거래 건수" value={`${data.summary.trades.toLocaleString()}건`} />
            <Metric label="거래액" value={`${data.summary.grossGold.toLocaleString()}G`} />
            <Metric label="판매세 소각" value={`${data.summary.taxGold.toLocaleString()}G`} />
            <Metric label="거래 수량" value={`${data.summary.volume.toLocaleString()}개`} />
            <Metric label="활성 판매 매물" value={`${data.summary.activeListings.toLocaleString()}건`} />
            <Metric label="활성 구매 주문" value={`${data.summary.activeBuyOrders.toLocaleString()}건`} />
            <Metric label="구매 에스크로" value={`${data.summary.escrowGold.toLocaleString()}G`} />
            <Metric
              label="정리 지연"
              value={`${(data.summary.expiredActiveListings + data.summary.expiredActiveBuyOrders).toLocaleString()}건`}
              risk={data.summary.expiredActiveListings + data.summary.expiredActiveBuyOrders > 0}
            />
          </div>
        ) : null}
      </section>

      {data ? (
        <>
          <section className="grid gap-4 lg:grid-cols-2">
            <DataPanel title="일별 거래">
              <Table
                headers={["날짜", "건수", "수량", "거래액", "세금"]}
                rows={data.daily.map((row) => [
                  row.date,
                  row.trades.toLocaleString(),
                  row.volume.toLocaleString(),
                  `${row.grossGold.toLocaleString()}G`,
                  `${row.taxGold.toLocaleString()}G`,
                ])}
              />
            </DataPanel>
            <DataPanel title="인기 품목">
              <Table
                headers={["품목", "건수", "수량", "거래액"]}
                rows={data.popularItems.map((row) => [
                  row.itemId,
                  row.trades.toLocaleString(),
                  row.volume.toLocaleString(),
                  `${row.grossGold.toLocaleString()}G`,
                ])}
                empty="최근 거래가 없습니다."
              />
            </DataPanel>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <DataPanel title="가격 급등락 (24시간 vs 이전 7일)">
              <Table
                headers={["품목", "현재", "기준", "변동"]}
                rows={data.priceMovements.map((row) => [
                  row.itemId,
                  `${row.currentUnitPrice.toLocaleString()}G`,
                  `${row.baselineUnitPrice.toLocaleString()}G`,
                  `${row.changePct > 0 ? "+" : ""}${row.changePct}%`,
                ])}
                empty="50% 이상 변동한 품목이 없습니다."
              />
            </DataPanel>
            <DataPanel title="이상 거래 확인 목록">
              <Table
                headers={["신호", "판매자", "구매자", "건수/금액"]}
                rows={data.suspicious.map((row) => [
                  suspiciousLabel(row.kind, row.itemId),
                  row.sellerId,
                  row.buyerId,
                  `${row.trades}건 · ${row.grossGold.toLocaleString()}G`,
                ])}
                empty="현재 기준에 걸린 거래가 없습니다."
              />
            </DataPanel>
          </section>

          <DataPanel title="장비 구매 주문 체결 감사">
            <Table
              headers={["위험", "주문/품목", "판매자 → 구매자", "체결가/하한", "위력/품질", "처리 흐름"]}
              rows={data.equipmentAudits.map((row) => [
                `${row.riskScore}점 · ${row.riskLevel === "review" ? "검토" : row.riskLevel === "watch" ? "관찰" : "정상"}${row.riskReasons.length > 0 ? ` (${row.riskReasons.map(riskReasonLabel).join(", ")})` : ""}`,
                `#${row.orderId} · ${row.itemId ?? "unknown"}`,
                `${row.sellerId ?? "unknown"} → ${row.buyerId ?? "unknown"}`,
                `${row.grossGold.toLocaleString()}G / ${row.minimumPrice.toLocaleString()}G`,
                `${row.power?.toLocaleString() ?? "-"} / ${row.qualityPct ?? "-"}%`,
                `주문 ${formatAuditTime(row.orderCreatedAt)} → 체결 ${formatAuditTime(row.createdAt)} → ${row.deliveryStatus === "claimed" ? `수령 ${formatAuditTime(row.inboxClaimedAt)}` : row.deliveryStatus === "pending" ? "우편 대기" : "우편 누락 확인"}`,
              ])}
              empty="최근 장비 구매 주문 체결이 없습니다."
            />
          </DataPanel>

          <DataPanel title="정리 지연 주문">
            <Table
              headers={["종류", "품목", "잔량", "만료 시각"]}
              rows={data.stalled.map((row) => [
                row.type === "listing" ? "판매 매물" : "구매 주문",
                row.itemName,
                row.quantity.toLocaleString(),
                new Date(row.expiresAt).toLocaleString("ko-KR"),
              ])}
              empty="만료 후 정리가 지연된 주문이 없습니다."
            />
          </DataPanel>
        </>
      ) : null}
    </div>
  );
}

function suspiciousLabel(
  kind: MarketplaceEconomy["suspicious"][number]["kind"],
  itemId?: string | null,
) {
  if (kind === "self_trade") return "자전거래";
  if (kind === "repeated_pair") return "반복 상대";
  if (kind === "same_ip_pair") return "동일 IP 장비 체결";
  if (kind === "floor_transfer") return "최저가 근접 장비 체결";
  return `비정상 가격${itemId ? ` · ${itemId}` : ""}`;
}

function riskReasonLabel(reason: string) {
  if (reason === "same_ip") return "동일 IP";
  if (reason === "near_floor") return "하한 근접";
  if (reason === "repeated_pair") return "반복 상대";
  return reason;
}

function formatAuditTime(value: string | null) {
  return value ? new Date(value).toLocaleString("ko-KR") : "기록 없음";
}

function Metric({ label, value, risk = false }: { label: string; value: string; risk?: boolean }) {
  return (
    <div className={`${SURFACE_INSET} p-3 ${risk ? "border-rose-300 text-rose-800 dark:border-rose-900 dark:text-rose-200" : ""}`}>
      <div className="text-[10px] text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="mt-1 font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function DataPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={`${SURFACE_CARD} overflow-hidden`}>
      <h3 className="border-b border-zinc-200 px-3 py-2.5 text-sm font-semibold dark:border-zinc-800">{title}</h3>
      {children}
    </section>
  );
}

function Table({ headers, rows, empty }: { headers: string[]; rows: string[][]; empty?: string }) {
  if (rows.length === 0) return <p className="p-4 text-xs text-zinc-500 dark:text-zinc-400">{empty ?? "데이터가 없습니다."}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-xs">
        <thead className="bg-zinc-50 text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
          <tr>{headers.map((header) => <th key={header} className="px-3 py-2 text-left font-medium">{header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {rows.map((row, index) => <tr key={`${row[0]}:${index}`}>{row.map((cell, cellIndex) => <td key={cellIndex} className="max-w-52 truncate px-3 py-2 font-mono text-[11px]" title={cell}>{cell}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}
