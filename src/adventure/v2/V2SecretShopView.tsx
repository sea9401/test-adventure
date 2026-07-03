"use client";

import { useCallback, useEffect, useState } from "react";
import { Coins } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { useGameState } from "@/adventure/v2/GameStateProvider";
import type { SecretShopItem } from "@/adventure/data/v2/secretShop";

// 비밀 상점 — 「비밀 상점 초대장」으로 입장. map 생략 시 서버가 유효한 초대장을 자동 선택한다.
// 서버(/api/v2/secret-shop)가 초대장 소유/품목 중복을 권위 검증.

type StockRow = SecretShopItem & { bought: boolean };

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
  const [msg, setMsg] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  const refresh = useCallback(async () => {
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
      } | null;
      if (!res.ok || !j?.ok) {
        setDenied(true);
        return;
      }
      setActiveMapIid(j.map ?? mapIid);
      setStock(j.stock ?? []);
      setGold(j.gold ?? 0);
      setBankedGold(j.bankedGold ?? 0);
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
        mapConsumed?: boolean;
      } | null;
      if (j?.ok) {
        if (typeof j.map === "string") setActiveMapIid(j.map);
        setMsg(
          `✓ ${item.name} 구매${j.mapConsumed ? " — 모든 품목을 구매해 초대장을 다 썼다" : ""}`,
        );
        if (typeof j.gold === "number") setGold(j.gold);
        if (typeof j.bankedGold === "number") {
          setBankedGold(j.bankedGold);
        }
        applyResourcePatch({
          gold: typeof j.gold === "number" ? j.gold : undefined,
          bankedGold:
            typeof j.bankedGold === "number" ? j.bankedGold : undefined,
        });
        await refresh();
        if (item.id === "stamina_potion" || item.id === "stamina_cap_tonic") {
          await refreshGameState();
        }
      } else {
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

  async function leaveShop() {
    if (busy) return;
    if (
      !window.confirm("남은 물품을 포기하고 비밀 상점 초대장을 소진할까요?")
    ) {
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v2/secret-shop", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ map: activeMapIid }),
      });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (j?.ok) {
        await refreshGameState();
        onBack();
      } else {
        const label =
          j?.error === "no_map"
            ? "이미 닫혔거나 만료된 초대장입니다"
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
      {gold != null && (
        <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
          품목당 1회 구매 · 초대장은 발견 후 30분 동안 유효
        </p>
      )}

      {denied ? (
        <Card padding="md">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            상인이 초대장을 확인하지 못했다 — 유효한 「비밀 상점 초대장」이
            필요합니다.
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
                  disabled={busy || item.bought || spendable < item.price}
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
            onClick={leaveShop}
            disabled={busy}
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
