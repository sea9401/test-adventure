"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Coins, X } from "@phosphor-icons/react";
import { TabBar } from "@/components/ui/TabBar";
import {
  V2_EQUIPMENT,
  V2_EQUIP_BONUS_KEYS,
  V2_EQUIP_BONUS_LABELS,
  V2_EQUIP_PERCENT_KEYS,
  shopPriceOf,
  type V2EquipmentId,
  type V2EquipStats,
} from "@/adventure/data/v2/v2Equipment";

// v2 상점 — 장비 전용. T1~T3 21종. sub-tab: 무기/방어구/장신구.
// 한 아이템 클릭 시 옵션(stats) 펼침 — 옛 description 노출 폐기.
// HP/MP 충전약은 치료소로 이전.

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
  const [expanded, setExpanded] = useState<V2EquipmentId | null>(null);
  const sectionRef = useRef<HTMLElement>(null);

  // 외부 클릭 시 popover 닫음. popover/section 안 클릭은 무시.
  useEffect(() => {
    if (expanded == null) return;
    const onMouseDown = (e: MouseEvent) => {
      if (
        sectionRef.current &&
        !sectionRef.current.contains(e.target as Node)
      ) {
        setExpanded(null);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [expanded]);

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
        onChange={(t) => {
          setSlotTab(t);
          setExpanded(null);
        }}
        ariaLabel="장비 부위"
        size="sm"
      />

      <section
        ref={sectionRef}
        className="divide-y divide-zinc-200 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800"
      >
        {ids.map((id) => (
          <EquipmentRow
            key={id}
            id={id}
            owned={owned.has(id)}
            gold={gold}
            busy={busy === id}
            expanded={expanded === id}
            onToggle={() => setExpanded((cur) => (cur === id ? null : id))}
            onClose={() => setExpanded(null)}
            onBuy={buy}
          />
        ))}
      </section>
    </main>
  );
}

function EquipmentRow({
  id,
  owned,
  gold,
  busy,
  expanded,
  onToggle,
  onClose,
  onBuy,
}: {
  id: V2EquipmentId;
  owned: boolean;
  gold: number;
  busy: boolean;
  expanded: boolean;
  onToggle: () => void;
  onClose: () => void;
  onBuy: (id: V2EquipmentId) => void;
}) {
  const item = V2_EQUIPMENT[id];
  const price = shopPriceOf(item) ?? 0;
  const affordable = gold >= price;
  const stats = statEntries(item.stats);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900 ${
          expanded ? "bg-zinc-50 dark:bg-zinc-900" : ""
        }`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-sm font-medium">{item.name}</span>
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
            T{item.tier}
          </span>
        </div>
        {owned ? (
          <span className="shrink-0 rounded bg-zinc-200 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            보유
          </span>
        ) : (
          <span
            className={`shrink-0 text-xs tabular-nums ${
              affordable
                ? "text-amber-700 dark:text-amber-300"
                : "text-zinc-400 dark:text-zinc-600"
            }`}
          >
            {price.toLocaleString()}g
          </span>
        )}
      </button>
      {expanded && (
        // 플로팅 카드 — row 아래 떠오름. 다른 row 위치 유지.
        // 외부 클릭은 V2ShopView 의 ref 가 처리. 내부 클릭은 stopPropagation.
        <div
          role="dialog"
          aria-label={`${item.name} 옵션`}
          onClick={(e) => e.stopPropagation()}
          className="absolute left-2 right-2 top-full z-20 mt-1 space-y-2 rounded-lg border border-zinc-300 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          <div className="flex items-baseline justify-between gap-2">
            <div className="min-w-0">
              <span className="text-sm font-semibold">{item.name}</span>
              <span className="ml-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                T{item.tier}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <X size={14} weight="bold" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {stats.length === 0 ? (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                옵션 없음
              </span>
            ) : (
              stats.map((s) => (
                <span
                  key={s}
                  className="rounded bg-zinc-200 px-1.5 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                >
                  {s}
                </span>
              ))
            )}
          </div>
          {!owned && (
            <button
              type="button"
              onClick={() => onBuy(id)}
              disabled={busy || !affordable}
              className="w-full rounded-md border border-amber-400 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 transition disabled:cursor-not-allowed disabled:opacity-50 hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/40"
            >
              {busy ? "구매 중…" : `${price.toLocaleString()} G 에 구매`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
