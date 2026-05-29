"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Coins } from "@phosphor-icons/react";
import { TabBar } from "@/components/ui/TabBar";
import {
  V2_EQUIPMENT,
  V2_EQUIP_BONUS_KEYS,
  V2_EQUIP_BONUS_LABELS,
  V2_EQUIP_PERCENT_KEYS,
  shopPriceOf,
  type V2EquipmentId,
  type V2EquipStats,
  type V2EquipTier,
} from "@/adventure/data/v2/v2Equipment";

// v2 상점 — 장비 전용. T1~T3 21종. sub-tab: 무기/방어구/장신구.
// 그리드 카드 레이아웃: 옵션이 카드 안에 직접 노출. 모바일 1col / sm 2col / lg 3col.

type SlotTab = "weapon" | "armor" | "accessory";

const SLOT_TABS: ReadonlyArray<{ key: SlotTab; label: string }> = [
  { key: "weapon", label: "무기" },
  { key: "armor", label: "방어구" },
  { key: "accessory", label: "장신구" },
];

// 슬롯별 상점 판매 가능 장비 id — T1→T3 순, 같은 티어 안은 concept 정렬.
const SHOP_IDS_BY_SLOT: Record<SlotTab, V2EquipmentId[]> = (() => {
  const groups: Record<SlotTab, V2EquipmentId[]> = {
    weapon: [],
    armor: [],
    accessory: [],
  };
  const items = Object.values(V2_EQUIPMENT)
    .filter((it) => shopPriceOf(it) != null)
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      if (a.concept !== b.concept) return a.concept.localeCompare(b.concept);
      return a.id.localeCompare(b.id);
    });
  for (const it of items) {
    if (it.slot in groups) groups[it.slot as SlotTab].push(it.id);
  }
  return groups;
})();

const CONCEPT_LABEL: Record<string, string> = {
  str: "힘",
  dex: "민",
  int: "지",
  heavy: "중갑",
  light: "경갑",
  luck: "운",
  mana: "마법",
};

// 티어 컬러 stripe + 티어 배지 톤.
const TIER_STRIPE: Record<V2EquipTier, string> = {
  1: "bg-zinc-300 dark:bg-zinc-700",
  2: "bg-emerald-400 dark:bg-emerald-600",
  3: "bg-amber-400 dark:bg-amber-500",
  4: "bg-rose-400 dark:bg-rose-500",
  5: "bg-violet-400 dark:bg-violet-500",
};
const TIER_BADGE: Record<V2EquipTier, string> = {
  1: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  2: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  3: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  4: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300",
  5: "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300",
};

function statEntries(stats: V2EquipStats): string[] {
  const out: string[] = [];
  for (const k of V2_EQUIP_BONUS_KEYS) {
    const v = stats[k];
    if (!v) continue;
    const sign = v >= 0 ? "+" : "";
    const unit = V2_EQUIP_PERCENT_KEYS.has(k) ? "%" : "";
    out.push(`${V2_EQUIP_BONUS_LABELS[k]} ${sign}${v}${unit}`);
  }
  return out;
}

export function V2ShopView({ onBack }: { onBack: () => void }) {
  const [gold, setGold] = useState<number>(0);
  const [owned, setOwned] = useState<Set<V2EquipmentId>>(new Set());
  const [busy, setBusy] = useState<V2EquipmentId | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [slotTab, setSlotTab] = useState<SlotTab>("weapon");

  const refresh = useCallback(async () => {
    try {
      const [stateRes, equipRes] = await Promise.all([
        fetch("/api/v2/me/state"),
        fetch("/api/v2/me/equipment"),
      ]);
      const stateJ = stateRes.ok
        ? ((await stateRes.json()) as { character?: { gold?: number } })
        : null;
      const equipJ = equipRes.ok
        ? ((await equipRes.json()) as { owned?: V2EquipmentId[] })
        : null;
      setGold(stateJ?.character?.gold ?? 0);
      setOwned(new Set(equipJ?.owned ?? []));
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const buy = useCallback(async (id: V2EquipmentId) => {
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
      if (typeof j.gold === "number") setGold(j.gold);
    } catch (err) {
      setMsg(`✗ ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }, []);

  const ids = useMemo(() => SHOP_IDS_BY_SLOT[slotTab], [slotTab]);

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <header className="flex items-baseline justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold">상점</h1>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            T1~T3 장비. 고급 장비는 던전 드랍으로.
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

      <TabBar
        tabs={SLOT_TABS}
        active={slotTab}
        onChange={setSlotTab}
        ariaLabel="장비 부위"
        size="sm"
      />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ids.map((id) => (
          <EquipmentCard
            key={id}
            id={id}
            owned={owned.has(id)}
            gold={gold}
            busy={busy === id}
            onBuy={buy}
          />
        ))}
      </section>
    </main>
  );
}

function EquipmentCard({
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
  const stats = statEntries(item.stats);
  const conceptLabel = CONCEPT_LABEL[item.concept] ?? item.concept;
  return (
    <article
      className={`flex flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900 ${
        owned ? "opacity-60" : ""
      }`}
    >
      <div className={`h-1 w-full ${TIER_STRIPE[item.tier]}`} aria-hidden />
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold text-zinc-800 dark:text-zinc-100">
            {item.name}
          </h3>
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${TIER_BADGE[item.tier]}`}
          >
            T{item.tier}
          </span>
        </div>
        <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
          {conceptLabel}
        </div>
        <div className="flex flex-wrap gap-1">
          {stats.length === 0 ? (
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              옵션 없음
            </span>
          ) : (
            stats.map((s) => (
              <span
                key={s}
                className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] tabular-nums text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
              >
                {s}
              </span>
            ))
          )}
        </div>
        <div className="mt-auto pt-1">
          {owned ? (
            <div className="rounded-md border border-zinc-200 px-3 py-1.5 text-center text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              이미 보유 중
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onBuy(id)}
              disabled={busy || !affordable}
              className="w-full rounded-md border border-amber-400 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 transition disabled:cursor-not-allowed disabled:opacity-50 hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/40"
            >
              {busy ? "구매 중…" : `${price.toLocaleString()} G`}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
