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

      <section>
        <div
          aria-hidden
          className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-2 pb-1.5 text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500 sm:grid-cols-[1fr_2fr_auto]"
        >
          <span>이름</span>
          <span className="hidden sm:block">옵션</span>
          <span className="text-right">가격</span>
        </div>
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {ids.map((id) => (
            <EquipmentRow
              key={id}
              id={id}
              owned={owned.has(id)}
              gold={gold}
              busy={busy === id}
              onBuy={buy}
            />
          ))}
        </ul>
      </section>
    </main>
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
  const stats = statEntries(item.stats);
  const conceptLabel = CONCEPT_LABEL[item.concept] ?? item.concept;
  return (
    <li
      className={`grid grid-cols-[1fr_auto_auto] items-center gap-x-3 gap-y-1 px-2 py-2 sm:grid-cols-[1fr_2fr_auto] ${
        owned ? "opacity-50" : ""
      }`}
    >
      {/* 좌측 — 티어 stripe + 이름 + 컨셉 */}
      <div className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden
          className={`h-5 w-1 shrink-0 rounded-sm ${TIER_STRIPE[item.tier]}`}
        />
        <div className="flex min-w-0 flex-col">
          <div className="flex items-baseline gap-1.5">
            <span className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              {item.name}
            </span>
            <span
              className={`shrink-0 rounded px-1 py-px text-[9px] font-semibold ${TIER_BADGE[item.tier]}`}
            >
              T{item.tier}
            </span>
          </div>
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
            {conceptLabel}
          </span>
        </div>
      </div>

      {/* 옵션 — 모바일은 row 아래로 wrap, sm 이상은 가운데 컬럼 */}
      <div className="col-span-3 flex flex-wrap gap-1 sm:col-span-1 sm:col-start-2">
        {stats.length === 0 ? (
          <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
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

      {/* 우측 — 가격/구매 버튼 또는 보유 배지 */}
      <div className="col-start-2 row-start-1 justify-self-end sm:col-start-3">
        {owned ? (
          <span className="rounded bg-zinc-200 px-2 py-1 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            보유
          </span>
        ) : (
          <button
            type="button"
            onClick={() => onBuy(id)}
            disabled={busy || !affordable}
            className="rounded-md border border-amber-400 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 transition disabled:cursor-not-allowed disabled:opacity-50 hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/40"
          >
            {busy ? "구매 중…" : `${price.toLocaleString()} G`}
          </button>
        )}
      </div>
    </li>
  );
}
