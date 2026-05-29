"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Coins } from "@phosphor-icons/react";
import { TabBar } from "@/components/ui/TabBar";
import {
  V2_EQUIPMENT,
  shopPriceOf,
  type V2Equipment,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";
import { V2ItemCard, anchorOf, type ItemCardAnchor } from "./V2ItemCard";

// v2 상점 — 장비 전용. T1~T5 35종. sub-tab: 무기/방어구/장신구.
// 보유 카운트 시스템: 보유 중인 아이템도 추가 구매 가능, 판매 가능(5%).

type SlotTab = "weapon" | "armor" | "accessory";

const SLOT_TABS: ReadonlyArray<{ key: SlotTab; label: string }> = [
  { key: "weapon", label: "무기" },
  { key: "armor", label: "방어구" },
  { key: "accessory", label: "장신구" },
];

const SELL_PRICE_RATIO = 0.05;

// 슬롯별 상점 판매 가능 장비 id — T1→T5 순, 같은 티어 안은 concept 정렬.
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

// 보유 카운트 맵 빌드 — owned array 의 등장 횟수.
function buildCountMap(owned: V2EquipmentId[]): Map<V2EquipmentId, number> {
  const m = new Map<V2EquipmentId, number>();
  for (const id of owned) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
}

export function V2ShopView({ onBack }: { onBack: () => void }) {
  const [gold, setGold] = useState<number>(0);
  const [counts, setCounts] = useState<Map<V2EquipmentId, number>>(new Map());
  const [busy, setBusy] = useState<{ id: V2EquipmentId; mode: "buy" | "sell" } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [slotTab, setSlotTab] = useState<SlotTab>("weapon");
  // 클릭 시 뜨는 옵션 카드 팝오버 — null 이면 닫힘.
  const [card, setCard] = useState<{
    item: V2Equipment;
    anchor: ItemCardAnchor;
  } | null>(null);

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
      setCounts(buildCountMap(equipJ?.owned ?? []));
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const buy = useCallback(async (id: V2EquipmentId) => {
    setBusy({ id, mode: "buy" });
    setMsg(null);
    try {
      const res = await fetch("/api/v2/shop/equipment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const j = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; gold?: number; owned?: V2EquipmentId[] }
        | null;
      if (!j?.ok) {
        setMsg(`✗ ${j?.error ?? `http ${res.status}`}`);
        return;
      }
      const item = V2_EQUIPMENT[id];
      setMsg(`✓ ${item.name} 구매`);
      setCounts(buildCountMap(j.owned ?? []));
      if (typeof j.gold === "number") setGold(j.gold);
    } catch (err) {
      setMsg(`✗ ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }, []);

  const sell = useCallback(async (id: V2EquipmentId) => {
    setBusy({ id, mode: "sell" });
    setMsg(null);
    try {
      const res = await fetch("/api/v2/shop/equipment/sell", {
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
            sellPrice?: number;
          }
        | null;
      if (!j?.ok) {
        setMsg(`✗ ${j?.error ?? `http ${res.status}`}`);
        return;
      }
      const item = V2_EQUIPMENT[id];
      setMsg(`✓ ${item.name} 판매 (+${j.sellPrice ?? 0} G)`);
      setCounts(buildCountMap(j.owned ?? []));
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
            구매 / 판매 (판매가 = 구매가의 5%).
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
          className="grid grid-cols-[1fr_auto] gap-x-3 px-2 pb-1.5 text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500"
        >
          <span>이름</span>
          <span className="text-right">거래</span>
        </div>
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {ids.map((id) => (
            <EquipmentRow
              key={id}
              id={id}
              count={counts.get(id) ?? 0}
              gold={gold}
              busyMode={busy?.id === id ? busy.mode : null}
              onBuy={buy}
              onSell={sell}
              onOpenCard={(item, anchor) => setCard({ item, anchor })}
            />
          ))}
        </ul>
      </section>
      {card && (
        <V2ItemCard
          item={card.item}
          anchor={card.anchor}
          onClose={() => setCard(null)}
        />
      )}
    </main>
  );
}

function EquipmentRow({
  id,
  count,
  gold,
  busyMode,
  onBuy,
  onSell,
  onOpenCard,
}: {
  id: V2EquipmentId;
  count: number;
  gold: number;
  busyMode: "buy" | "sell" | null;
  onBuy: (id: V2EquipmentId) => void;
  onSell: (id: V2EquipmentId) => void;
  onOpenCard: (item: V2Equipment, anchor: ItemCardAnchor) => void;
}) {
  const item = V2_EQUIPMENT[id];
  const buyPrice = shopPriceOf(item) ?? 0;
  const sellPrice = Math.max(1, Math.floor(buyPrice * SELL_PRICE_RATIO));
  const affordable = gold >= buyPrice;
  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-x-3 px-2 py-2">
      {/* 이름 영역 클릭 → 옵션 카드 팝오버 (옵션은 행에 인라인으로 적지 않음) */}
      <button
        type="button"
        onClick={(e) => onOpenCard(item, anchorOf(e.currentTarget))}
        className="flex min-w-0 items-center gap-2 rounded text-left transition-colors hover:bg-zinc-100/70 dark:hover:bg-zinc-800/50"
      >
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            {item.name}
          </span>
          {count > 0 && (
            <span className="shrink-0 rounded bg-zinc-200 px-1 py-px text-[10px] font-semibold tabular-nums text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              ×{count}
            </span>
          )}
        </div>
      </button>

      {/* 우측 — 구매 / 판매 버튼 */}
      <div className="flex shrink-0 items-center gap-1 justify-self-end">
        <button
          type="button"
          onClick={() => onBuy(id)}
          disabled={busyMode !== null || !affordable}
          title={`${buyPrice.toLocaleString()} G 에 구매`}
          className="rounded-md border border-amber-400 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 transition disabled:cursor-not-allowed disabled:opacity-50 hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/40"
        >
          {busyMode === "buy" ? "…" : `${buyPrice.toLocaleString()} G`}
        </button>
        <button
          type="button"
          onClick={() => onSell(id)}
          disabled={busyMode !== null || count <= 0}
          title={count > 0 ? `${sellPrice.toLocaleString()} G 에 판매` : "보유 없음"}
          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 transition disabled:cursor-not-allowed disabled:opacity-30 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          {busyMode === "sell" ? "…" : `판매 ${sellPrice.toLocaleString()}`}
        </button>
      </div>
    </li>
  );
}
