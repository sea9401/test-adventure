"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Coins } from "@phosphor-icons/react";
import { TabBar } from "@/components/ui/TabBar";
import { Card } from "@/components/ui/Card";
import {
  V2_EQUIPMENT,
  shopPriceOf,
  type V2Equipment,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";
import {
  V2_MATERIALS,
  V2_MATERIAL_SELL_PRICE,
  type V2MaterialId,
} from "@/adventure/data/v2/dungeonDrops";
import { V2ItemCard, anchorOf, type ItemCardAnchor } from "./V2ItemCard";

// v2 상점 — 상위 탭: 구매 / 판매.
//  - 구매: 장비 카탈로그 (무기/방어구/장신구). 보유 중이어도 추가 구매 가능.
//  - 판매: 보유한 장비(무기/방어구/장신구) + 재료를 골드로 환금.
// 장비 판매가 = 구매가의 5%. 재료는 고정 판매가(V2_MATERIAL_SELL_PRICE), 구매 불가.

type Mode = "buy" | "sell";
type SlotTab = "weapon" | "armor" | "gloves" | "boots" | "ring" | "necklace";
type SubTab = SlotTab | "material";

const SLOT_TABS: ReadonlyArray<{ key: SubTab; label: string }> = [
  { key: "weapon", label: "무기" },
  { key: "armor", label: "갑옷" },
  { key: "gloves", label: "장갑" },
  { key: "boots", label: "신발" },
  { key: "ring", label: "반지" },
  { key: "necklace", label: "목걸이" },
];
// 판매 탭에만 재료 추가 — 재료는 사고팔기 중 '판매(환금)'만 지원.
const SELL_TABS: ReadonlyArray<{ key: SubTab; label: string }> = [
  ...SLOT_TABS,
  { key: "material", label: "재료" },
];

const MODE_TABS: ReadonlyArray<{ key: Mode; label: string }> = [
  { key: "buy", label: "구매" },
  { key: "sell", label: "판매" },
];

const SELL_PRICE_RATIO = 0.05;

// 슬롯별 상점 취급 장비 id — concept 정렬 (티어는 표시하지 않지만 정렬엔 사용).
const SHOP_IDS_BY_SLOT: Record<SlotTab, V2EquipmentId[]> = (() => {
  const groups: Record<SlotTab, V2EquipmentId[]> = {
    weapon: [],
    armor: [],
    gloves: [],
    boots: [],
    ring: [],
    necklace: [],
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

const MATERIAL_IDS = Object.keys(V2_MATERIALS) as V2MaterialId[];

// 보유 카운트 맵 빌드 — owned array 의 등장 횟수.
function buildCountMap(owned: V2EquipmentId[]): Map<V2EquipmentId, number> {
  const m = new Map<V2EquipmentId, number>();
  for (const id of owned) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
}

export function V2ShopView({ onBack }: { onBack: () => void }) {
  const [gold, setGold] = useState<number>(0);
  const [counts, setCounts] = useState<Map<V2EquipmentId, number>>(new Map());
  const [materials, setMaterials] = useState<
    Partial<Record<V2MaterialId, number>>
  >({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("buy");
  const [subTab, setSubTab] = useState<SubTab>("weapon");
  // 클릭 시 뜨는 옵션 카드 팝오버 (장비 전용) — null 이면 닫힘.
  const [card, setCard] = useState<{
    item: V2Equipment;
    anchor: ItemCardAnchor;
  } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [stateRes, equipRes, invRes] = await Promise.all([
        fetch("/api/v2/me/state"),
        fetch("/api/v2/me/equipment"),
        fetch("/api/v2/me/inventory"),
      ]);
      const stateJ = stateRes.ok
        ? ((await stateRes.json()) as { character?: { gold?: number } })
        : null;
      const equipJ = equipRes.ok
        ? ((await equipRes.json()) as { owned?: V2EquipmentId[] })
        : null;
      const invJ = invRes.ok
        ? ((await invRes.json()) as {
            materials?: Partial<Record<V2MaterialId, number>>;
          })
        : null;
      setGold(stateJ?.character?.gold ?? 0);
      setCounts(buildCountMap(equipJ?.owned ?? []));
      setMaterials(invJ?.materials ?? {});
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onModeChange = useCallback((m: Mode) => {
    setMode(m);
    setSubTab("weapon");
    setMsg(null);
    setCard(null);
  }, []);

  const buy = useCallback(async (id: V2EquipmentId) => {
    setBusyId(id);
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
      setBusyId(null);
    }
  }, []);

  const sellEquipment = useCallback(async (id: V2EquipmentId) => {
    setBusyId(id);
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
      setBusyId(null);
    }
  }, []);

  // 재료는 보유 스택 전량을 한 번에 환금.
  const sellMaterial = useCallback(async (id: V2MaterialId) => {
    setBusyId(id);
    setMsg(null);
    try {
      const res = await fetch("/api/v2/shop/material/sell", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const j = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            gold?: number;
            materials?: Partial<Record<V2MaterialId, number>>;
            sold?: { count: number; gold: number };
          }
        | null;
      if (!j?.ok) {
        setMsg(`✗ ${j?.error ?? `http ${res.status}`}`);
        return;
      }
      const mat = V2_MATERIALS[id];
      setMsg(
        `✓ ${mat.name} ×${j.sold?.count ?? 0} 판매 (+${j.sold?.gold ?? 0} G)`,
      );
      setMaterials(j.materials ?? {});
      if (typeof j.gold === "number") setGold(j.gold);
    } catch (err) {
      setMsg(`✗ ${(err as Error).message}`);
    } finally {
      setBusyId(null);
    }
  }, []);

  const subTabs = mode === "buy" ? SLOT_TABS : SELL_TABS;

  // 현재 탭에 보여줄 항목들.
  const buyIds = useMemo(
    () => (subTab === "material" ? [] : SHOP_IDS_BY_SLOT[subTab]),
    [subTab],
  );
  const sellEquipIds = useMemo(
    () =>
      subTab === "material"
        ? []
        : SHOP_IDS_BY_SLOT[subTab].filter((id) => (counts.get(id) ?? 0) > 0),
    [subTab, counts],
  );
  const ownedMaterialIds = useMemo(
    () => MATERIAL_IDS.filter((id) => (materials[id] ?? 0) > 0),
    [materials],
  );

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <header className="flex items-baseline justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold">상점</h1>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            장비 판매가 = 구매가의 5% · 재료는 고정가 환금
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
              ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              : "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-300"
          }`}
        >
          {msg}
        </div>
      )}

      {/* 상위 탭 — 구매 / 판매 */}
      <TabBar
        tabs={MODE_TABS}
        active={mode}
        onChange={onModeChange}
        ariaLabel="구매 / 판매"
        size="sm"
        variant="highlight"
      />

      {/* 하위 탭 — 부위 (+ 판매 모드엔 재료) */}
      <TabBar
        tabs={subTabs}
        active={subTab}
        onChange={setSubTab}
        ariaLabel="분류"
        size="sm"
        variant="highlight"
      />

      <section>
        {mode === "buy" ? (
          <Card padding="none" className="overflow-hidden">
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {buyIds.map((id) => (
                <BuyEquipmentRow
                  key={id}
                  id={id}
                  count={counts.get(id) ?? 0}
                  gold={gold}
                  busy={busyId === id}
                  onBuy={buy}
                  onOpenCard={(item, anchor) => setCard({ item, anchor })}
                />
              ))}
            </ul>
          </Card>
        ) : subTab === "material" ? (
          ownedMaterialIds.length === 0 ? (
            <EmptyHint text="판매할 재료가 없습니다. 사냥으로 모아보세요." />
          ) : (
            <Card padding="none" className="overflow-hidden">
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {ownedMaterialIds.map((id) => (
                  <MaterialRow
                    key={id}
                    id={id}
                    count={materials[id] ?? 0}
                    busy={busyId === id}
                    onSell={sellMaterial}
                  />
                ))}
              </ul>
            </Card>
          )
        ) : sellEquipIds.length === 0 ? (
          <EmptyHint text="판매할 장비가 없습니다." />
        ) : (
          <Card padding="none" className="overflow-hidden">
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {sellEquipIds.map((id) => (
                <SellEquipmentRow
                  key={id}
                  id={id}
                  count={counts.get(id) ?? 0}
                  busy={busyId === id}
                  onSell={sellEquipment}
                  onOpenCard={(item, anchor) => setCard({ item, anchor })}
                />
              ))}
            </ul>
          </Card>
        )}
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

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-zinc-300 bg-white px-3 py-6 text-center text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
      {text}
    </div>
  );
}

// 장비 이름 영역 — 클릭 시 옵션 카드 팝오버. 구매/판매 행이 공유.
function EquipmentName({
  item,
  count,
  onOpenCard,
}: {
  item: V2Equipment;
  count: number;
  onOpenCard: (item: V2Equipment, anchor: ItemCardAnchor) => void;
}) {
  return (
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
  );
}

function BuyEquipmentRow({
  id,
  count,
  gold,
  busy,
  onBuy,
  onOpenCard,
}: {
  id: V2EquipmentId;
  count: number;
  gold: number;
  busy: boolean;
  onBuy: (id: V2EquipmentId) => void;
  onOpenCard: (item: V2Equipment, anchor: ItemCardAnchor) => void;
}) {
  const item = V2_EQUIPMENT[id];
  const buyPrice = shopPriceOf(item) ?? 0;
  const affordable = gold >= buyPrice;
  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-x-3 px-3 py-2.5">
      <EquipmentName item={item} count={count} onOpenCard={onOpenCard} />
      <button
        type="button"
        onClick={() => onBuy(id)}
        disabled={busy || !affordable}
        title={`${buyPrice.toLocaleString()} G 에 구매`}
        className="justify-self-end rounded-md border border-amber-600 bg-amber-600 px-2.5 py-1 text-xs font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50 hover:bg-amber-700"
      >
        {busy ? "…" : `${buyPrice.toLocaleString()} G`}
      </button>
    </li>
  );
}

function SellEquipmentRow({
  id,
  count,
  busy,
  onSell,
  onOpenCard,
}: {
  id: V2EquipmentId;
  count: number;
  busy: boolean;
  onSell: (id: V2EquipmentId) => void;
  onOpenCard: (item: V2Equipment, anchor: ItemCardAnchor) => void;
}) {
  const item = V2_EQUIPMENT[id];
  const buyPrice = shopPriceOf(item) ?? 0;
  const sellPrice = Math.max(1, Math.floor(buyPrice * SELL_PRICE_RATIO));
  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-x-3 px-3 py-2.5">
      <EquipmentName item={item} count={count} onOpenCard={onOpenCard} />
      <button
        type="button"
        onClick={() => onSell(id)}
        disabled={busy || count <= 0}
        title={`${sellPrice.toLocaleString()} G 에 판매`}
        className="justify-self-end rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 transition disabled:cursor-not-allowed disabled:opacity-30 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        {busy ? "…" : `판매 +${sellPrice.toLocaleString()}`}
      </button>
    </li>
  );
}

function MaterialRow({
  id,
  count,
  busy,
  onSell,
}: {
  id: V2MaterialId;
  count: number;
  busy: boolean;
  onSell: (id: V2MaterialId) => void;
}) {
  const mat = V2_MATERIALS[id];
  const unit = V2_MATERIAL_SELL_PRICE[id];
  const total = unit * count;
  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-x-3 px-3 py-2.5">
      <div className="flex min-w-0 items-baseline gap-1.5" title={mat.description}>
        <span className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          {mat.name}
        </span>
        <span className="shrink-0 rounded bg-zinc-200 px-1 py-px text-[10px] font-semibold tabular-nums text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          ×{count}
        </span>
        <span className="shrink-0 text-[10px] text-zinc-400 dark:text-zinc-500 tabular-nums">
          개당 {unit}G
        </span>
      </div>
      <button
        type="button"
        onClick={() => onSell(id)}
        disabled={busy || count <= 0}
        title={`보유 ${count}개 전량 판매 (+${total.toLocaleString()} G)`}
        className="justify-self-end rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 transition disabled:cursor-not-allowed disabled:opacity-30 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        {busy ? "…" : `전량 판매 +${total.toLocaleString()}`}
      </button>
    </li>
  );
}
