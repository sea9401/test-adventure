"use client";

import { useCallback, useEffect, useState } from "react";
import { Coins } from "@phosphor-icons/react";

// v2 상점 — HP/MP 충전식 (1g=1, 1000 cap). 옛 POTIONS 카탈로그 폐기.
// 상점에 들러서 캐릭의 충전약 보유량을 채워둠 → 사냥 후 자동 회복 hook 이 부족분 차감.

const MAX_CHARGE = 1000;

type ShopState = {
  gold: number;
  hpCharges: number;
  mpCharges: number;
};

type Kind = "hp" | "mp";

export function V2ShopView({ onBack }: { onBack: () => void }) {
  const [state, setState] = useState<ShopState | null>(null);
  const [busy, setBusy] = useState<Kind | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const stateRes = await fetch("/api/v2/me/state");
      const stateJ = stateRes.ok
        ? ((await stateRes.json()) as { character?: { gold?: number } })
        : null;
      const invRes = await fetch("/api/v2/me/inventory");
      const invJ = invRes.ok
        ? ((await invRes.json()) as { hpCharges?: number; mpCharges?: number })
        : null;
      setState({
        gold: stateJ?.character?.gold ?? 0,
        hpCharges: invJ?.hpCharges ?? 0,
        mpCharges: invJ?.mpCharges ?? 0,
      });
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const buy = useCallback(async (kind: Kind, amount: number) => {
    setBusy(kind);
    setMsg(null);
    try {
      const res = await fetch("/api/v2/shop/charge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, amount }),
      });
      const j = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            charged?: number;
            gold?: number;
            hpCharges?: number;
            mpCharges?: number;
          }
        | null;
      if (!j?.ok) {
        setMsg(`✗ ${j?.error ?? `http ${res.status}`}`);
        return;
      }
      setMsg(`✓ ${kind === "hp" ? "HP" : "MP"} +${j.charged ?? amount} 충전`);
      // 응답에 새 gold/charges 다 있음 — refresh 없이 직접 state 갱신 (layout shift 제거).
      setState((prev) => ({
        gold: j.gold ?? prev?.gold ?? 0,
        hpCharges: j.hpCharges ?? prev?.hpCharges ?? 0,
        mpCharges: j.mpCharges ?? prev?.mpCharges ?? 0,
      }));
    } catch (err) {
      setMsg(`✗ ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }, []);

  const gold = state?.gold ?? 0;
  const hp = state?.hpCharges ?? 0;
  const mp = state?.mpCharges ?? 0;

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <header className="flex items-baseline justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold">상점</h1>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            HP·MP 충전약 (1g당 1 충전, 최대 {MAX_CHARGE}). 사냥 후 자동 회복에 사용.
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
        <span className="tabular-nums">{gold.toLocaleString()}g</span>
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

      <ChargeRow
        label="HP 충전약"
        kind="hp"
        current={hp}
        gold={gold}
        busy={busy === "hp"}
        onBuy={buy}
      />
      <ChargeRow
        label="MP 충전약"
        kind="mp"
        current={mp}
        gold={gold}
        busy={busy === "mp"}
        onBuy={buy}
      />
    </main>
  );
}

function ChargeRow({
  label,
  kind,
  current,
  gold,
  busy,
  onBuy,
}: {
  label: string;
  kind: Kind;
  current: number;
  gold: number;
  busy: boolean;
  onBuy: (kind: Kind, amount: number) => void;
}) {
  const room = MAX_CHARGE - current;
  const full = room <= 0;
  const buyAmounts = [10, 100, 1000];
  return (
    <section className="space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-medium">{label}</h2>
        <span className="text-sm tabular-nums text-zinc-600 dark:text-zinc-400">
          {current.toLocaleString()} / {MAX_CHARGE.toLocaleString()}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {buyAmounts.map((amt) => {
          const actual = Math.min(amt, room);
          const cost = actual;
          const affordable = gold >= cost && actual > 0;
          return (
            <button
              key={amt}
              type="button"
              onClick={() => onBuy(kind, amt)}
              disabled={busy || full || !affordable}
              className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 transition disabled:cursor-not-allowed disabled:opacity-50 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
            >
              +{amt} ({cost}g)
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onBuy(kind, room)}
          disabled={busy || full || gold < room}
          className="rounded-md border border-emerald-400 bg-emerald-100 px-3 py-1.5 text-sm font-medium text-emerald-800 transition disabled:cursor-not-allowed disabled:opacity-50 hover:bg-emerald-200 dark:border-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-200 dark:hover:bg-emerald-800/40"
        >
          꽉 채우기 ({room}g)
        </button>
      </div>
      {full && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">최대치.</p>
      )}
    </section>
  );
}
