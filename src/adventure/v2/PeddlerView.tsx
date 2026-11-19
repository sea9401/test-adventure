"use client";

import { useCallback, useEffect, useState } from "react";
import { Package } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadErrorBanner } from "@/components/ui/LoadErrorBanner";
import { PageShell } from "@/components/ui/PageShell";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { confirmGameAction } from "@/components/ui/gameDialog";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { PeddlerCargoPicker } from "./PeddlerCargoPicker";
import { PeddlerShopPanel } from "./PeddlerShopPanel";
import {
  peddlerErrorLabel,
  peddlerRemainingLabel,
  peddlerRouteUnlockText,
  type PeddlerPostResult,
  type PeddlerRouteView,
  type PeddlerShopView,
  type PeddlerViewData,
} from "./peddlerClient";
import {
  PEDDLER_PREFERRED_BONUS_PCT,
  PEDDLER_REQUIRED_LIFE_LEVEL,
  PEDDLER_ROUTES,
  type PeddlerDispatchHours,
  type PeddlerRouteId,
} from "./peddlerRules";

type Notice = { tone: "success" | "error"; text: string };
type Tab = "dispatch" | "shop";

const TAB_OPTIONS: { key: Tab; label: string }[] = [
  { key: "dispatch", label: "파견" },
  { key: "shop", label: "증표 교환" },
];
const CONFIRM_TOKEN_COST = 100;
const TICK_MS = 30_000;

async function postPeddler(body: Record<string, unknown>): Promise<PeddlerPostResult> {
  try {
    const response = await fetch("/api/v2/peddler", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await response.json()) as PeddlerPostResult;
  } catch {
    return { ok: false };
  }
}

function formatNumber(value: number): string {
  return value.toLocaleString("ko-KR");
}

export function PeddlerView({ onBack }: { onBack: () => void }) {
  const [view, setView] = useState<PeddlerViewData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [tab, setTab] = useState<Tab>("dispatch");
  const [packingRouteId, setPackingRouteId] = useState<PeddlerRouteId | null>(null);
  // 서버 시각과 기기 시각의 차이. 남은 시간은 서버 시각 기준으로 센다.
  const [clockOffset, setClockOffset] = useState(0);
  const [now, setNow] = useState(0);

  const applyView = useCallback((next: PeddlerViewData) => {
    const offset = next.now - Date.now();
    setView(next);
    setClockOffset(offset);
    setNow(next.now);
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/v2/peddler");
      const json = (await response.json()) as { ok?: boolean } & PeddlerViewData;
      if (!response.ok || !json.ok) throw new Error("load_failed");
      setLoadFailed(false);
      applyView(json);
    } catch {
      setLoadFailed(true);
    }
  }, [applyView]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 서버 상태를 불러온 뒤 렌더링한다.
    void load();
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() + clockOffset), TICK_MS);
    return () => clearInterval(timer);
  }, [clockOffset]);

  const submit = async (
    key: string,
    body: Record<string, unknown>,
    success: (result: Extract<PeddlerPostResult, { ok: true }>) => string,
  ) => {
    setBusyKey(key);
    setNotice(null);
    const result = await postPeddler(body);
    setBusyKey(null);
    if (result.ok) {
      applyView(result.view);
      setNotice({ tone: "success", text: success(result) });
      return true;
    }
    setNotice({ tone: "error", text: peddlerErrorLabel(result.error) });
    return false;
  };

  const dispatch = async (route: PeddlerRouteView, hours: PeddlerDispatchHours, cargo: Record<string, number>) => {
    const sent = await submit(
      `route:${route.id}`,
      { action: "dispatch", routeId: route.id, hours, cargo },
      (result) => `${route.name} 출발 · 도착하면 증표 ${formatNumber(result.dispatched?.tokens ?? 0)}개`,
    );
    if (sent) setPackingRouteId(null);
  };

  const claim = (route: PeddlerRouteView) =>
    submit(`route:${route.id}`, { action: "claim", routeId: route.id }, (result) => {
      const claimed = result.claimed;
      if (!claimed) return "수령 완료";
      return [
        `증표 +${formatNumber(claimed.tokens)}`,
        `교역 점수 +${formatNumber(claimed.points)}`,
        ...(claimed.rankAfter > claimed.rankBefore ? [`교역 ${claimed.rankAfter}등급`] : []),
        ...claimed.titleNames.map((name) => `칭호 ${name} 획득`),
      ].join(" · ");
    });

  const buy = async (item: PeddlerShopView, quantity: number) => {
    const cost = item.tokenCost * quantity;
    if (cost >= CONFIRM_TOKEN_COST) {
      const confirmed = await confirmGameAction({
        title: "증표 교환",
        message: `행상 증표 ${formatNumber(cost)}개로 ${item.name}을(를) ${quantity}번 교환합니다.`,
        confirmLabel: "교환",
      });
      if (!confirmed) return;
    }
    await submit(`shop:${item.id}`, { action: "buy", itemId: item.id, quantity }, () => `${item.name} 교환 완료`);
  };

  return (
    <PageShell spacing="tight">
      <SubViewHeader
        title="행상"
        onBack={onBack}
        help={
          <ul className="list-disc space-y-1 pl-4">
            <li>산물을 수레에 실어 교역로로 보내면 정한 시간이 지난 뒤 행상 증표를 받습니다.</li>
            <li>원목, 광석, 채광 부산물, 가공재, 작물, 축산물, 어획물, 요리를 실을 수 있습니다.</li>
            <li>
              교역로마다 매주 월요일 0시에 우대 품목 2종이 바뀌고, 우대 품목은 증표를{" "}
              {(100 + PEDDLER_PREFERRED_BONUS_PCT) / 100}배로 계산합니다.
            </li>
            <li>보낸 적재 점수만큼 그 교역로의 교역 점수가 쌓이고, 교역 등급이 오르면 적재량이 늘어납니다.</li>
            <li>출발한 수레는 되돌릴 수 없습니다. 행상 증표는 주가 바뀌어도 남습니다.</li>
          </ul>
        }
      />

      {loadFailed ? <LoadErrorBanner onRetry={() => void load()} /> : null}
      {notice ? <StatusBanner tone={notice.tone}>{notice.text}</StatusBanner> : null}

      {!view ? (
        !loadFailed ? <p className="text-sm text-zinc-500 dark:text-zinc-400">불러오는 중…</p> : null
      ) : !view.unlocked ? (
        <EmptyState
          icon={<Package size={32} weight="duotone" aria-hidden />}
          title="아직 행상을 보낼 수 없습니다"
          message={`농사, 벌목, 채광, 낚시, 요리 중 하나를 Lv.${PEDDLER_REQUIRED_LIFE_LEVEL}까지 올리면 첫 교역로가 열립니다.`}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <StatusCell label="행상 증표" value={formatNumber(view.tokens)} />
            <StatusCell label="교역 등급 합계" value={formatNumber(view.totalRank)} />
          </div>
          <SegmentedControl ariaLabel="행상 보기" options={TAB_OPTIONS} value={tab} onChange={setTab} />

          {tab === "dispatch" ? (
            <div className="space-y-3">
              {view.routes.map((route) => (
                <RouteCard
                  key={route.id}
                  route={route}
                  now={now}
                  busy={busyKey === `route:${route.id}`}
                  packing={packingRouteId === route.id}
                  onOpen={() => setPackingRouteId(route.id)}
                  onClaim={() => void claim(route)}
                >
                  {packingRouteId === route.id ? (
                    <PeddlerCargoPicker
                      route={route}
                      cargo={view.cargo}
                      tokenCarry={view.tokenCarry}
                      busy={busyKey === `route:${route.id}`}
                      onDispatch={(hours, cargo) => void dispatch(route, hours, cargo)}
                      onClose={() => setPackingRouteId(null)}
                    />
                  ) : null}
                </RouteCard>
              ))}
            </div>
          ) : (
            <PeddlerShopPanel
              items={view.shop}
              tokens={view.tokens}
              busyKey={busyKey}
              onBuy={(item, quantity) => void buy(item, quantity)}
            />
          )}
        </>
      )}
    </PageShell>
  );
}

function StatusCell({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${SURFACE_INSET} p-2.5 text-center`}>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-0.5 font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{value}</p>
    </div>
  );
}

function RouteCard({
  route,
  now,
  busy,
  packing,
  onOpen,
  onClaim,
  children,
}: {
  route: PeddlerRouteView;
  now: number;
  busy: boolean;
  /** 짐 싣기를 열어 둔 상태. */
  packing: boolean;
  onOpen: () => void;
  onClaim: () => void;
  children?: React.ReactNode;
}) {
  const headingId = `peddler-route-${route.id}`;
  const unlock = PEDDLER_ROUTES.find((entry) => entry.id === route.id)!.unlock;
  const dispatch = route.dispatch;
  const remaining = dispatch ? peddlerRemainingLabel(dispatch.readyAt, now) : "";
  const arrived = dispatch !== null && remaining === "";

  return (
    <section role="region" aria-labelledby={headingId} className={`${SURFACE_CARD} p-3`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={headingId} className="font-bold text-zinc-900 dark:text-zinc-100">
            {route.name}
          </h2>
          {route.unlocked ? (
            <p className="text-xs tabular-nums text-zinc-600 dark:text-zinc-300">
              교역 {route.rank}등급 · 적재량 {formatNumber(route.capacity)}점
            </p>
          ) : (
            <p className="text-xs text-zinc-600 dark:text-zinc-300">{peddlerRouteUnlockText(unlock)}</p>
          )}
        </div>
        {!route.unlocked ? null : arrived ? (
          <Button variant="primary" className="min-h-10 shrink-0" loading={busy} onClick={onClaim}>
            받기
          </Button>
        ) : !dispatch && !packing ? (
          <Button className="min-h-10 shrink-0" onClick={onOpen}>
            짐 싣기
          </Button>
        ) : null}
      </div>

      {route.unlocked ? (
        <div className="mt-2 space-y-0.5 text-xs tabular-nums text-zinc-600 dark:text-zinc-300">
          <p>이번 주 우대 품목: {route.preferred.map((item) => item.name).join(", ")}</p>
          <p>
            {route.nextRankAt === null
              ? "교역 최고 등급"
              : `다음 등급까지 ${formatNumber(Math.max(0, route.nextRankAt - route.standingPoints))}점`}
          </p>
          {dispatch ? (
            <p className="pt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {arrived
                ? `도착 · 증표 ${formatNumber(dispatch.tokens)}개`
                : `${formatNumber(dispatch.points)}점 싣고 ${dispatch.hours}시간 파견 중 · ${remaining} · 도착하면 증표 ${formatNumber(dispatch.tokens)}개`}
            </p>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
