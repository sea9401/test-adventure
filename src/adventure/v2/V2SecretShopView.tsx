"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Coins } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { useGameState } from "@/adventure/v2/GameStateProvider";
import type { SecretShopItem } from "@/adventure/data/v2/secretShop";
import { useSystemMessageState } from "./RewardToastProvider";
import {
  correctedSecretShopExpiry,
  formatSecretShopRemaining,
} from "./secretShopCountdown";

// 비밀 상점 — 사냥터에 열린 「비밀 상점 지도」로 입장.
// 서버(/api/v2/secret-shop)가 지도 소유/품목 중복을 권위 검증.

type StockRow = SecretShopItem & { bought: boolean };

export function SecretShopAccessNote({
  remainingMs,
}: {
  remainingMs: number | null;
}) {
  return (
    <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
      품목당 1회 구매 · 비밀 상점 지도는 발견 후 30분 동안 개방
      {remainingMs != null
        ? ` · 남은 시간 ${formatSecretShopRemaining(remainingMs)}`
        : ""}
    </p>
  );
}

export function V2SecretShopView({
  mapIid,
  onBack,
}: {
  mapIid: string;
  onBack: () => void;
}) {
  // 지불 게이트 — flag on 이면 보유+은행. 은행 잔액은 로컬(GET·구매 응답)로 추적 + 컨텍스트 동기화.
  const {
    coreLoopOn,
    refreshGameState,
    applyResourcePatch,
  } = useGameState();
  const [stock, setStock] = useState<StockRow[] | null>(null);
  const [gold, setGold] = useState<number | null>(null);
  const [bankedGold, setBankedGold] = useState(0);
  const [activeMapIid, setActiveMapIid] = useState(mapIid);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useSystemMessageState();
  const [denied, setDenied] = useState(false);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [expired, setExpired] = useState(false);
  const expiryHandledRef = useRef(false);

  const expireAndLeave = useCallback(() => {
    if (expiryHandledRef.current) return;
    expiryHandledRef.current = true;
    setExpired(true);
    setMsg("✗ 비밀 상점 이용 시간이 종료되었습니다");
    onBack();
  }, [onBack, setMsg]);

  const refresh = useCallback(async () => {
    setDenied(false);
    try {
      const res = await fetch(
        `/api/v2/secret-shop?map=${encodeURIComponent(mapIid)}`,
      );
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        map?: string;
        stock?: StockRow[];
        gold?: number;
        bankedGold?: number;
        expiresAt?: number;
        serverNow?: number;
      } | null;
      if (!res.ok || !j?.ok) {
        setDenied(true);
        return;
      }
      setActiveMapIid(j.map ?? mapIid);
      setStock(j.stock ?? []);
      setGold(j.gold ?? 0);
      setBankedGold(j.bankedGold ?? 0);
      if (
        typeof j.expiresAt === "number" &&
        Number.isFinite(j.expiresAt) &&
        typeof j.serverNow === "number" &&
        Number.isFinite(j.serverNow)
      ) {
        const clientNow = Date.now();
        expiryHandledRef.current = false;
        setExpired(false);
        setClockNow(clientNow);
        setExpiresAt(
          correctedSecretShopExpiry(j.expiresAt, j.serverNow, clientNow),
        );
      } else {
        setExpiresAt(null);
      }
      applyResourcePatch({
        gold: j.gold ?? 0,
        bankedGold: j.bankedGold ?? 0,
      });
    } catch {
      setDenied(true);
    }
  }, [mapIid, applyResourcePatch]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트/지도 변경 시 비밀상점 fetch
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (expiresAt == null || expired) return;
    const updateClock = () => {
      const nextNow = Date.now();
      setClockNow(nextNow);
      if (nextNow >= expiresAt) expireAndLeave();
    };
    const intervalId = window.setInterval(updateClock, 1_000);
    const expiryTimeoutId = window.setTimeout(
      updateClock,
      Math.max(0, expiresAt - Date.now()),
    );
    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(expiryTimeoutId);
    };
  }, [expiresAt, expired, expireAndLeave]);

  async function buy(item: StockRow) {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v2/secret-shop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ map: activeMapIid, itemId: item.id }),
      });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        map?: string;
        gold?: number;
        bankedGold?: number;
        hpCharges?: number;
        mpCharges?: number;
        mapCompleted?: boolean;
      } | null;
      if (j?.ok) {
        if (typeof j.map === "string") setActiveMapIid(j.map);
        setMsg(
          `✓ ${item.name} 구매${j.mapCompleted ? " — 모든 품목을 구매해 비밀 상점을 완료했다" : ""}`,
        );
        if (typeof j.gold === "number") setGold(j.gold);
        if (typeof j.bankedGold === "number") {
          setBankedGold(j.bankedGold);
        }
        applyResourcePatch({
          gold: typeof j.gold === "number" ? j.gold : undefined,
          bankedGold:
            typeof j.bankedGold === "number" ? j.bankedGold : undefined,
          hpCharges:
            typeof j.hpCharges === "number" ? j.hpCharges : undefined,
          mpCharges:
            typeof j.mpCharges === "number" ? j.mpCharges : undefined,
        });
        if (j.mapCompleted) {
          await refreshGameState();
          onBack();
          return;
        }
        await refresh();
        if (item.id === "stamina_potion") {
          await refreshGameState();
        }
      } else {
        if (j?.error === "no_map") {
          expireAndLeave();
          return;
        }
        const label =
          j?.error === "insufficient_gold"
            ? "골드가 부족합니다"
            : j?.error === "already_bought"
              ? "이미 구매한 품목입니다"
              : (j?.error ?? `http ${res.status}`);
        setMsg(`✗ ${label}`);
      }
    } catch (err) {
      setMsg(`✗ network: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  // flag off 면 보유만(===gold, prod 무변경), on 이면 보유+은행(은행 골드로도 구매).
  const spendable = coreLoopOn ? (gold ?? 0) + bankedGold : gold ?? 0;
  const remainingMs =
    expiresAt == null ? null : Math.max(0, expiresAt - clockNow);
  return (
    <PageShell>
      <SubViewHeader
        title="비밀 상점"
        onBack={onBack}
        right={
          gold != null ? (
            <span className="flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-200">
              <Coins size={16} weight="fill" className="text-yellow-500" />
              <span className="font-semibold tabular-nums">
                {spendable.toLocaleString()}G
              </span>
            </span>
          ) : null
        }
      />
      {gold != null && <SecretShopAccessNote remainingMs={remainingMs} />}

      {denied ? (
        <Card padding="md">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            비밀 상점으로 이어지는 유효한 지도를 찾지 못했습니다.
          </p>
        </Card>
      ) : stock === null ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <div className="space-y-2">
          {msg && (
            <StatusBanner tone={msg.startsWith("✓") ? "success" : "error"}>
              {msg}
            </StatusBanner>
          )}
          {stock.map((item) => (
            <Card key={item.id} padding="sm">
              <div className="flex min-h-14 items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{item.name}</div>
                  <div className="mt-0.5 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
                    {item.desc}
                  </div>
                </div>
                <Button
                  onClick={() => buy(item)}
                  disabled={
                    busy || expired || item.bought || spendable < item.price
                  }
                  variant={item.bought ? "secondary" : "info"}
                  size="xs"
                  className="shrink-0"
                >
                  {item.bought
                    ? "구매함"
                    : `${item.price.toLocaleString()} G`}
                </Button>
              </div>
            </Card>
          ))}
          <Button
            onClick={onBack}
            disabled={busy || expired}
            variant="danger"
            size="sm"
            fullWidth
          >
            나가기
          </Button>
        </div>
      )}
    </PageShell>
  );
}
