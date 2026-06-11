"use client";

import { useCallback, useEffect, useState } from "react";
import { BackButton } from "@/components/ui/BackButton";
import { HeaderPanel } from "@/components/ui/HeaderPanel";
import { Card } from "@/components/ui/Card";
import type { SecretShopItem } from "@/adventure/data/v2/secretShop";

// 비밀 상점 — 「비밀 상점의 지도」로 입장. 품목당 1회 구매, 지도 만료(48h)까지 재방문 가능.
// 서버(/api/v2/secret-shop)가 지도 소유/품목 중복을 권위 검증.

type StockRow = SecretShopItem & { bought: boolean };

export function V2SecretShopView({
  mapIid,
  onBack,
}: {
  mapIid: string;
  onBack: () => void;
}) {
  const [stock, setStock] = useState<StockRow[] | null>(null);
  const [gold, setGold] = useState<number | null>(null);
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
        stock?: StockRow[];
        gold?: number;
      } | null;
      if (!res.ok || !j?.ok) {
        setDenied(true);
        return;
      }
      setStock(j.stock ?? []);
      setGold(j.gold ?? 0);
    } catch {
      setDenied(true);
    }
  }, [mapIid]);

  useEffect(() => {
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
        body: JSON.stringify({ map: mapIid, itemId: item.id }),
      });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        gold?: number;
        mapConsumed?: boolean;
      } | null;
      if (j?.ok) {
        setMsg(
          `✓ ${item.name} 구매${j.mapConsumed ? " — 모든 품목을 구매해 지도가 바스러졌다" : ""}`,
        );
        if (typeof j.gold === "number") setGold(j.gold);
        await refresh();
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

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <HeaderPanel className="space-y-2">
        <BackButton onClick={onBack} />
        <h1 className="text-lg font-bold">비밀 상점</h1>
        {gold != null && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            보유 골드{" "}
            <span className="font-medium tabular-nums text-yellow-600 dark:text-yellow-400">
              {gold.toLocaleString()} G
            </span>
            {" · "}품목당 1회 구매 · 지도가 닳기 전(48h)까지 재방문 가능
          </p>
        )}
      </HeaderPanel>

      {denied ? (
        <Card padding="md">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            상인이 약도를 알아보지 못한다 — 유효한 「비밀 상점의 지도」가
            필요합니다.
          </p>
        </Card>
      ) : stock === null ? (
        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          불러오는 중…
        </div>
      ) : (
        <div className="space-y-2">
          {msg && (
            <div
              className={`rounded-md border px-3 py-1.5 text-xs ${
                msg.startsWith("✓")
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                  : "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-300"
              }`}
            >
              {msg}
            </div>
          )}
          {stock.map((item) => (
            <Card key={item.id} padding="sm">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{item.name}</div>
                  <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {item.desc}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => buy(item)}
                  disabled={busy || item.bought || (gold ?? 0) < item.price}
                  className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium ${
                    item.bought
                      ? "cursor-not-allowed border border-zinc-300 text-zinc-400 dark:border-zinc-700 dark:text-zinc-500"
                      : "border border-sky-700 bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
                  }`}
                >
                  {item.bought
                    ? "구매함"
                    : `${item.price.toLocaleString()} G`}
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
