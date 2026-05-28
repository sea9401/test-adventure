"use client";

import { useCallback, useEffect, useState } from "react";
import { Coins } from "@phosphor-icons/react";
import { POTIONS, type PotionId } from "@/adventure/data/potions";

// v2 상점 minimal — POTIONS 카탈로그 (HP/MP 6종) 만 구매. 라이브 /api/shop 라우트 그대로
// 사용 (character.v2 + inventory.v2 잠금 + gold 차감 + potion 누계). 다른 카테고리
// (재료/장비/소비재) 는 v2 inventory 시스템과 호환 위해 후속.

type ShopState = {
  gold: number;
  potions: Partial<Record<PotionId, number>>;
};

export function V2ShopView({ onBack }: { onBack: () => void }) {
  const [state, setState] = useState<ShopState | null>(null);
  const [busy, setBusy] = useState<PotionId | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/v2/me/state");
      if (!res.ok) return;
      const j = (await res.json()) as {
        character?: { gold?: number };
      };
      const invRes = await fetch("/api/v2/me/inventory");
      const inv = invRes.ok
        ? ((await invRes.json()) as { potions?: Partial<Record<PotionId, number>> })
        : null;
      setState({
        gold: j.character?.gold ?? 0,
        potions: inv?.potions ?? {},
      });
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const buy = useCallback(
    async (id: PotionId) => {
      setBusy(id);
      setMsg(null);
      try {
        const res = await fetch("/api/shop", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind: "buy_potion", id, quantity: 1 }),
        });
        const j = (await res.json().catch(() => null)) as
          | { ok?: boolean; error?: string }
          | null;
        if (!j?.ok) {
          setMsg(`✗ ${j?.error ?? `http ${res.status}`}`);
          return;
        }
        setMsg(`✓ ${POTIONS[id].name} 구매`);
        await refresh();
      } catch (err) {
        setMsg(`✗ ${(err as Error).message}`);
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  const buyables = (Object.keys(POTIONS) as PotionId[])
    .map((id) => POTIONS[id])
    .filter((p) => p.inShop !== false)
    .sort((a, b) => (a.shopPrice ?? a.price) - (b.shopPrice ?? b.price));

  return (
    <main className="mx-auto max-w-2xl space-y-3 p-6 text-zinc-900 dark:text-zinc-100">
      <header className="flex items-baseline justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold">상점</h1>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            물약 카탈로그 (HP / MP). 라이브 /api/shop 라우트 그대로.
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          ← 뒤로
        </button>
      </header>
      <div className="flex items-center justify-end gap-1.5 text-sm text-zinc-700 dark:text-zinc-200">
        <Coins size={16} weight="fill" className="text-yellow-500" />
        <span className="tabular-nums">
          {(state?.gold ?? 0).toLocaleString()}g
        </span>
      </div>
      {msg && (
        <div
          className={`rounded-md border px-3 py-1.5 text-xs ${
            msg.startsWith("✓")
              ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
              : "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
          }`}
        >
          {msg}
        </div>
      )}
      <ul className="divide-y divide-zinc-200 overflow-hidden rounded-md border border-zinc-200 bg-white/90 dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950/90">
        {buyables.map((p) => {
          const owned = state?.potions[p.id] ?? 0;
          const price = p.shopPrice ?? p.price;
          const affordable = (state?.gold ?? 0) >= price;
          return (
            <li
              key={p.id}
              className="flex items-center gap-3 px-3 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{p.name}</div>
                <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  보유 {owned}
                </div>
              </div>
              <div className="shrink-0 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                {price.toLocaleString()}g
              </div>
              <button
                type="button"
                onClick={() => buy(p.id)}
                disabled={busy === p.id || !affordable}
                className="shrink-0 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 transition disabled:cursor-not-allowed disabled:opacity-50 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
              >
                {busy === p.id ? "…" : "구매"}
              </button>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
