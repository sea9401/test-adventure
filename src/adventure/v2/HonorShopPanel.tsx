"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";

// 명예상점 — 정착지 전쟁 개인 화폐(명예) 소비처. 설계: docs/v2-settlement-warfare-plan.md §2.5.
//   수비 전투 승리·길드 골드 입금으로 모은 명예로 구매. V2GuildHome "명예상점" 탭에서 렌더(flag on).

type Item = { id: string; name: string; cost: number };

export default function HonorShopPanel() {
  const [honor, setHonor] = useState<number | null>(null);
  const [honorEarned, setHonorEarned] = useState<number | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/v2/me/honor-shop");
      const j = r.ok ? await r.json() : null;
      if (j?.ok) {
        setHonor(j.honor ?? 0);
        setHonorEarned(j.honorEarned ?? j.honor ?? 0);
        setItems(Array.isArray(j.items) ? (j.items as Item[]) : []);
      }
    } catch {
      /* 표시 전용 */
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 1회 명성상점 fetch
    void load();
  }, [load]);

  const buy = useCallback(
    async (itemId: string) => {
      setBusy(true);
      setMsg(null);
      try {
        const r = await fetch("/api/v2/me/honor-shop", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ itemId }),
        });
        const j = (await r.json().catch(() => null)) as
          | { ok: true; honor: number; honorEarned: number; granted: string }
          | { ok: false; error: string }
          | null;
        if (j?.ok) {
          setHonor(j.honor);
          setHonorEarned(j.honorEarned ?? j.honor);
          setMsg("✓ 구매 완료 — 스태미나 회복약 +1");
        } else {
          setMsg(
            `✗ ${j?.error === "insufficient_honor" ? "명성이 부족합니다" : (j?.error ?? "구매 실패")}`,
          );
        }
      } catch (e) {
        setMsg(`✗ ${(e as Error).message}`);
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  return (
    <Card padding="md">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">명성상점</h2>
        <span className="text-sm font-medium tabular-nums text-amber-600 dark:text-amber-400">
          명성 {honor === null ? "…" : honor.toLocaleString()}
          <span className="ml-1 text-xs font-normal text-zinc-500 dark:text-zinc-400">
            · 누적 {honorEarned === null ? "…" : honorEarned.toLocaleString()}
          </span>
        </span>
      </div>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        수비 전투 승리·길드 골드 입금으로 모은 명성으로 구매합니다.
      </p>
      <div className="mt-3 space-y-2">
        {items.map((it) => {
          const afford = honor != null && honor >= it.cost;
          return (
            <div
              key={it.id}
              className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800"
            >
              <div>
                <div className="text-sm font-medium">{it.name}</div>
                <div className="text-xs text-zinc-500">명성 {it.cost}</div>
              </div>
              <button
                type="button"
                onClick={() => buy(it.id)}
                disabled={busy || !afford}
                className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                구매
              </button>
            </div>
          );
        })}
        {items.length === 0 && honor !== null && (
          <p className="text-sm text-zinc-400">품목이 없습니다.</p>
        )}
      </div>
      {msg && (
        <p
          className={`mt-2 text-xs ${
            msg.startsWith("✓")
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-rose-600 dark:text-rose-400"
          }`}
        >
          {msg}
        </p>
      )}
    </Card>
  );
}
