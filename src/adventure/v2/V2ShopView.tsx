"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Coins } from "@phosphor-icons/react";
import {
  V2_EQUIPMENT,
  shopPriceOf,
  type V2EquipmentId,
  type V2EquipTier,
} from "@/adventure/data/v2/v2Equipment";

// v2 상점.
//   1) HP/MP 충전약 (1g당 1 충전, 1000 cap)
//   2) T1~T3 장비 (마을에서 구매. T4-5 는 던전 드랍 전용)

const MAX_CHARGE = 1000;

type ShopState = {
  gold: number;
  hpCharges: number;
  mpCharges: number;
};

type Kind = "hp" | "mp";

const SLOT_LABEL: Record<string, string> = {
  weapon: "무기",
  armor: "방어",
  accessory: "장신",
};

// 상점 판매 가능한 장비 — T1~T3, 보기 좋게 정렬.
const SHOP_EQUIPMENT_IDS: V2EquipmentId[] = Object.values(V2_EQUIPMENT)
  .filter((it) => shopPriceOf(it) != null)
  .sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    const slotOrder: Record<string, number> = {
      weapon: 0,
      armor: 1,
      accessory: 2,
    };
    if (a.slot !== b.slot) return slotOrder[a.slot] - slotOrder[b.slot];
    return a.id.localeCompare(b.id);
  })
  .map((it) => it.id);

export function V2ShopView({ onBack }: { onBack: () => void }) {
  const [state, setState] = useState<ShopState | null>(null);
  const [owned, setOwned] = useState<Set<V2EquipmentId>>(new Set());
  const [busy, setBusy] = useState<Kind | V2EquipmentId | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [openTier, setOpenTier] = useState<V2EquipTier | null>(1);

  const refresh = useCallback(async () => {
    try {
      const [stateRes, invRes, equipRes] = await Promise.all([
        fetch("/api/v2/me/state"),
        fetch("/api/v2/me/inventory"),
        fetch("/api/v2/me/equipment"),
      ]);
      const stateJ = stateRes.ok
        ? ((await stateRes.json()) as { character?: { gold?: number } })
        : null;
      const invJ = invRes.ok
        ? ((await invRes.json()) as { hpCharges?: number; mpCharges?: number })
        : null;
      const equipJ = equipRes.ok
        ? ((await equipRes.json()) as { owned?: V2EquipmentId[] })
        : null;
      setState({
        gold: stateJ?.character?.gold ?? 0,
        hpCharges: invJ?.hpCharges ?? 0,
        mpCharges: invJ?.mpCharges ?? 0,
      });
      setOwned(new Set(equipJ?.owned ?? []));
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const buyCharge = useCallback(async (kind: Kind, amount: number) => {
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

  const buyEquipment = useCallback(
    async (id: V2EquipmentId) => {
      setBusy(id);
      setMsg(null);
      try {
        const res = await fetch("/api/v2/shop/equipment", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id }),
        });
        const j = (await res.json().catch(() => null)) as
          | {
              ok?: boolean;
              error?: string;
              gold?: number;
              owned?: V2EquipmentId[];
            }
          | null;
        if (!j?.ok) {
          setMsg(`✗ ${j?.error ?? `http ${res.status}`}`);
          return;
        }
        const item = V2_EQUIPMENT[id];
        setMsg(`✓ ${item.name} 구매`);
        setOwned(new Set(j.owned ?? []));
        if (typeof j.gold === "number") {
          setState((prev) =>
            prev ? { ...prev, gold: j.gold ?? prev.gold } : prev,
          );
        }
      } catch (err) {
        setMsg(`✗ ${(err as Error).message}`);
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const equipByTier = useMemo(() => {
    const groups: Record<V2EquipTier, V2EquipmentId[]> = {
      1: [],
      2: [],
      3: [],
      4: [],
      5: [],
    };
    for (const id of SHOP_EQUIPMENT_IDS) {
      const item = V2_EQUIPMENT[id];
      groups[item.tier].push(id);
    }
    return groups;
  }, []);

  const gold = state?.gold ?? 0;
  const hp = state?.hpCharges ?? 0;
  const mp = state?.mpCharges ?? 0;

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <header className="flex items-baseline justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold">상점</h1>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            HP·MP 충전약과 초·중반 장비 (T1~T3). 고급 장비는 던전에서.
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
        onBuy={buyCharge}
      />
      <ChargeRow
        label="MP 충전약"
        kind="mp"
        current={mp}
        gold={gold}
        busy={busy === "mp"}
        onBuy={buyCharge}
      />

      <section className="space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <h2 className="text-base font-medium">장비</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          T1~T3. 한 번 구매 후 캐릭터 → 장비에서 착용.
        </p>
        {([1, 2, 3] as V2EquipTier[]).map((tier) => {
          const ids = equipByTier[tier];
          const isOpen = openTier === tier;
          return (
            <div
              key={tier}
              className="rounded-md border border-zinc-200 dark:border-zinc-800"
            >
              <button
                type="button"
                onClick={() => setOpenTier(isOpen ? null : tier)}
                className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900"
              >
                <span>T{tier} 장비</span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {ids.filter((id) => owned.has(id)).length}/{ids.length} 보유
                </span>
              </button>
              {isOpen && (
                <div className="divide-y divide-zinc-200 border-t border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                  {ids.map((id) => (
                    <EquipmentRow
                      key={id}
                      id={id}
                      owned={owned.has(id)}
                      gold={gold}
                      busy={busy === id}
                      onBuy={buyEquipment}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </section>
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

function EquipmentRow({
  id,
  owned,
  gold,
  busy,
  onBuy,
}: {
  id: V2EquipmentId;
  owned: boolean;
  gold: number;
  busy: boolean;
  onBuy: (id: V2EquipmentId) => void;
}) {
  const item = V2_EQUIPMENT[id];
  const price = shopPriceOf(item) ?? 0;
  const affordable = gold >= price;
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium">{item.name}</span>
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
            {SLOT_LABEL[item.slot] ?? item.slot}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400 truncate">
          {item.description}
        </p>
      </div>
      {owned ? (
        <span className="shrink-0 rounded bg-zinc-200 px-2 py-1 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
          보유
        </span>
      ) : (
        <button
          type="button"
          onClick={() => onBuy(id)}
          disabled={busy || !affordable}
          className="shrink-0 rounded-md border border-amber-400 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 transition disabled:cursor-not-allowed disabled:opacity-50 hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/40"
        >
          {price.toLocaleString()}g
        </button>
      )}
    </div>
  );
}
