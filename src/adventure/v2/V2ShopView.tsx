"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BackButton } from "@/components/ui/BackButton";
import { LoadErrorBanner } from "@/components/ui/LoadErrorBanner";
import { Coins } from "@phosphor-icons/react";
import { TabBar } from "@/components/ui/TabBar";
import { Card } from "@/components/ui/Card";
import { ItemTypeChip } from "@/components/ui/ItemTypeChip";
import {
  V2_EQUIPMENT,
  shopPriceOf,
  shopPriceForSell,
  sellPriceOf,
  v2ItemTypeLabel,
  type V2Equipment,
  type V2EquipInstance,
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

// 구매 표 열: 아이템 | 종류 | 가격 | 위력/무게 | 구매. 종류는 이름과 가격 사이.
const BUY_GRID_CLASS =
  "grid grid-cols-[minmax(0,1fr)_3rem_4.25rem_4.25rem_3.5rem] sm:grid-cols-[minmax(0,1fr)_4.5rem_6.5rem_6rem_5.25rem]";

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

// 개체 배열 → id별 보유 카운트(판매 후보 표시용).
function buildCountMap(
  owned: V2EquipInstance[],
): Map<V2EquipmentId, number> {
  const m = new Map<V2EquipmentId, number>();
  for (const inst of owned) m.set(inst.id, (m.get(inst.id) ?? 0) + 1);
  return m;
}

export function V2ShopView({ onBack }: { onBack: () => void }) {
  const [gold, setGold] = useState<number>(0);
  const [counts, setCounts] = useState<Map<V2EquipmentId, number>>(new Map());
  // 장착 instance 가 있는 id 집합 — 판매 카드 잠금(장착분 보호, #426). count<=1 이면 locked.
  const [equipped, setEquipped] = useState<Set<V2EquipmentId>>(new Set());
  // 개체 목록 + 장착 iid — 판매 시 id → 미장착 개체(iid) 해석에 사용.
  const [ownedInsts, setOwnedInsts] = useState<V2EquipInstance[]>([]);
  const [equippedIids, setEquippedIids] = useState<Set<string>>(new Set());
  const [materials, setMaterials] = useState<
    Partial<Record<V2MaterialId, number>>
  >({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("buy");
  const [loadError, setLoadError] = useState(false);
  const [subTab, setSubTab] = useState<SubTab>("weapon");
  // 클릭 시 뜨는 옵션 카드 팝오버 (장비 전용) — null 이면 닫힘.
  const [card, setCard] = useState<{
    item: V2Equipment;
    anchor: ItemCardAnchor;
  } | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(false);
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
        ? ((await equipRes.json()) as {
            owned?: V2EquipInstance[];
            equipped?: Record<string, string>;
          })
        : null;
      const invJ = invRes.ok
        ? ((await invRes.json()) as {
            materials?: Partial<Record<V2MaterialId, number>>;
          })
        : null;
      setGold(stateJ?.character?.gold ?? 0);
      const insts = equipJ?.owned ?? [];
      const eqIids = new Set(Object.values(equipJ?.equipped ?? {}));
      setOwnedInsts(insts);
      setCounts(buildCountMap(insts));
      setEquippedIids(eqIids);
      // 장착 instance 가 있는 id 집합 — 카드 잠금(#426)용.
      setEquipped(
        new Set(insts.filter((i) => eqIids.has(i.iid)).map((i) => i.id)),
      );
      setMaterials(invJ?.materials ?? {});
    } catch {
      setLoadError(true);
    }
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
        | {
            ok?: boolean;
            error?: string;
            gold?: number;
            owned?: V2EquipInstance[];
          }
        | null;
      if (!j?.ok) {
        setMsg(`✗ ${j?.error ?? `http ${res.status}`}`);
        return;
      }
      const item = V2_EQUIPMENT[id];
      setMsg(`✓ ${item.name} 구매`);
      const insts = j.owned ?? [];
      setOwnedInsts(insts);
      setCounts(buildCountMap(insts));
      if (typeof j.gold === "number") setGold(j.gold);
    } catch (err) {
      setMsg(`✗ ${(err as Error).message}`);
    } finally {
      setBusyId(null);
    }
  }, []);

  // 판매는 개체(iid) 단위 — id 로 누른 카드는 그 종류의 미장착 개체 1개(없으면 아무거나)를 판다.
  // 장착분만 남은 경우(카드는 locked 라 보통 클릭 불가) 서버가 "equipped" 로 거부(#426).
  const sellEquipment = useCallback(
    async (id: V2EquipmentId) => {
      const inst =
        ownedInsts.find((i) => i.id === id && !equippedIids.has(i.iid)) ??
        ownedInsts.find((i) => i.id === id);
      if (!inst) {
        setMsg("✗ 판매할 개체가 없습니다");
        return;
      }
      setBusyId(id);
      setMsg(null);
      try {
        const res = await fetch("/api/v2/shop/equipment/sell", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ iid: inst.iid }),
        });
        const j = (await res.json().catch(() => null)) as
          | {
              ok?: boolean;
              error?: string;
              gold?: number;
              owned?: V2EquipInstance[];
              sellPrice?: number;
            }
          | null;
        if (!j?.ok) {
          const reason =
            j?.error === "equipped"
              ? "장착 중인 장비는 판매할 수 없습니다"
              : (j?.error ?? `http ${res.status}`);
          setMsg(`✗ ${reason}`);
          // 서버가 장착분 판매를 막았으면 화면 상태를 최신으로 맞춘다.
          if (j?.error === "equipped") refresh();
          return;
        }
        const item = V2_EQUIPMENT[id];
        setMsg(`✓ ${item.name} 판매 (+${j.sellPrice ?? 0} G)`);
        const insts = j.owned ?? [];
        setOwnedInsts(insts);
        setCounts(buildCountMap(insts));
        if (typeof j.gold === "number") setGold(j.gold);
      } catch (err) {
        setMsg(`✗ ${(err as Error).message}`);
      } finally {
        setBusyId(null);
      }
    },
    [ownedInsts, equippedIids, refresh],
  );

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

  // 구매 표 정렬 — 헤더 클릭으로 토글. null = 카탈로그 기본순(티어·컨셉).
  const [sort, setSort] = useState<{
    key: "name" | "type" | "price" | "power";
    dir: "asc" | "desc";
  } | null>(null);
  const toggleSort = useCallback((key: "name" | "type" | "price" | "power") => {
    setSort((prev) =>
      prev?.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
  }, []);

  // 현재 탭에 보여줄 항목들.
  const buyIds = useMemo(
    () => (subTab === "material" ? [] : SHOP_IDS_BY_SLOT[subTab]),
    [subTab],
  );
  // 구매 표 — 정렬 적용. 이름=가나다(ko locale), 가격=상점가, 위력/무게=위력 우선 후 무게.
  const sortedBuyIds = useMemo(() => {
    if (!sort) return buyIds;
    const sign = sort.dir === "asc" ? 1 : -1;
    return [...buyIds].sort((a, b) => {
      const ia = V2_EQUIPMENT[a];
      const ib = V2_EQUIPMENT[b];
      let cmp = 0;
      if (sort.key === "name") cmp = ia.name.localeCompare(ib.name, "ko");
      else if (sort.key === "type")
        // 종류(무기는 세검/대검/활…, 그 외 부위)별 묶음. 같은 종류는 이름순 안정 정렬.
        cmp =
          v2ItemTypeLabel(ia).localeCompare(v2ItemTypeLabel(ib), "ko") ||
          ia.name.localeCompare(ib.name, "ko");
      else if (sort.key === "price")
        cmp = (shopPriceOf(ia) ?? 0) - (shopPriceOf(ib) ?? 0);
      else cmp = ia.power - ib.power || ia.weight - ib.weight;
      return cmp * sign;
    });
  }, [buyIds, sort]);
  // 판매 목록 = 그 슬롯에서 보유 중인 모든 판매가능 id (상점 미판매 드랍 T3/T5 포함 — 상점이
  //   스타터 전용이 된 뒤에도 파밍 장비를 팔 수 있어야). 비매(유니크/제작/스타터)는 제외. 티어→이름순.
  const sellEquipIds = useMemo(() => {
    if (subTab === "material") return [];
    return [...counts.keys()]
      .filter((id) => {
        const it = V2_EQUIPMENT[id];
        return (
          it &&
          it.slot === subTab &&
          (counts.get(id) ?? 0) > 0 &&
          shopPriceForSell(it) != null
        );
      })
      .sort((a, b) => {
        const ia = V2_EQUIPMENT[a];
        const ib = V2_EQUIPMENT[b];
        return (
          ia.tier - ib.tier ||
          ia.concept.localeCompare(ib.concept) ||
          ia.id.localeCompare(ib.id)
        );
      });
  }, [subTab, counts]);
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
        <BackButton onClick={onBack} />
      </header>
      {loadError && <LoadErrorBanner onRetry={refresh} />}
      <div className="flex items-center justify-end gap-1.5 text-sm text-zinc-700 dark:text-zinc-200">
        <Coins size={16} weight="fill" className="text-yellow-500" />
        <span className="font-semibold tabular-nums">{gold.toLocaleString()}G</span>
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
          <Card padding="none" className="overflow-hidden dark:border-zinc-700">
            <div className="text-sm">
              <div
                className={`${BUY_GRID_CLASS} border-b border-zinc-200 bg-zinc-100/60 text-[11px] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400`}
                role="row"
              >
                <SortTh
                  label="아이템"
                  sortKey="name"
                  sort={sort}
                  onSort={toggleSort}
                  align="left"
                />
                <SortTh
                  label="종류"
                  sortKey="type"
                  sort={sort}
                  onSort={toggleSort}
                  align="left"
                />
                <SortTh
                  label="가격"
                  sortKey="price"
                  sort={sort}
                  onSort={toggleSort}
                  align="right"
                />
                <SortTh
                  label="위력/무게"
                  sortKey="power"
                  sort={sort}
                  onSort={toggleSort}
                  align="right"
                />
                <div
                  className="min-w-0 whitespace-nowrap px-2 py-3 text-right font-semibold sm:px-3"
                  role="columnheader"
                >
                  구매
                </div>
              </div>
              <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {sortedBuyIds.map((id) => (
                  <BuyEquipmentRow
                    key={id}
                    id={id}
                    gold={gold}
                    busy={busyId === id}
                    onBuy={buy}
                    onOpenCard={(item, anchor) => setCard({ item, anchor })}
                  />
                ))}
              </div>
            </div>
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
                  equipped={equipped.has(id)}
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
  showTypeChip = true,
}: {
  item: V2Equipment;
  // 보유 개수 — 지정 시에만 ×N 배지 표시. 구매 화면은 생략(판매 화면만 표기).
  count?: number;
  onOpenCard: (item: V2Equipment, anchor: ItemCardAnchor) => void;
  // 종류 칩 — 구매 표는 별도 '종류' 열이 있어 false(중복 방지). 판매 목록은 기본 true.
  showTypeChip?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => onOpenCard(item, anchorOf(e.currentTarget))}
      className="flex min-w-0 items-center gap-2 rounded text-left transition-colors hover:bg-zinc-100/70 dark:hover:bg-zinc-800/50"
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          {item.name}
        </span>
        {showTypeChip && <ItemTypeChip item={item} />}
        {(count ?? 0) > 0 && (
          <span className="shrink-0 rounded bg-zinc-200 px-1 py-px text-[10px] font-semibold tabular-nums text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            ×{count}
          </span>
        )}
      </div>
    </button>
  );
}

// 구매 목록 정렬 헤더 셀 — 클릭 시 정렬 토글, 활성 시 방향 화살표(▲/▼).
function SortTh({
  label,
  sortKey,
  sort,
  onSort,
  align,
}: {
  label: string;
  sortKey: "name" | "type" | "price" | "power";
  sort: {
    key: "name" | "type" | "price" | "power";
    dir: "asc" | "desc";
  } | null;
  onSort: (key: "name" | "type" | "price" | "power") => void;
  align: "left" | "right";
}) {
  const active = sort?.key === sortKey;
  const arrow =
    sort && sort.key === sortKey ? (sort.dir === "asc" ? " ▲" : " ▼") : "";
  return (
    <div
      className={`min-w-0 whitespace-nowrap py-3 font-semibold ${
        align === "left"
          ? "pl-4 pr-2 text-left sm:pl-5 sm:pr-3"
          : "px-2 text-right sm:px-3"
      }`}
      role="columnheader"
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex max-w-full items-center whitespace-nowrap transition-colors hover:text-zinc-800 dark:hover:text-zinc-200 ${
          active ? "text-zinc-800 dark:text-zinc-200" : ""
        }`}
      >
        <span className="truncate">{label}</span>
        <span className="shrink-0 tabular-nums">{arrow}</span>
      </button>
    </div>
  );
}

// 구매 표 한 행 — 이름 / 가격 / 위력·무게 / 구매 버튼.
function BuyEquipmentRow({
  id,
  gold,
  busy,
  onBuy,
  onOpenCard,
}: {
  id: V2EquipmentId;
  gold: number;
  busy: boolean;
  onBuy: (id: V2EquipmentId) => void;
  onOpenCard: (item: V2Equipment, anchor: ItemCardAnchor) => void;
}) {
  const item = V2_EQUIPMENT[id];
  const buyPrice = shopPriceOf(item) ?? 0;
  const affordable = gold >= buyPrice;
  return (
    <div
      className={`${BUY_GRID_CLASS} items-center hover:bg-zinc-50 dark:hover:bg-zinc-800/60`}
      role="row"
    >
      {/* 구매 화면은 보유 개수(×N) 미표기 — 판매 화면만 표기. 종류 칩은 별도 열로 빼서
          이름 옆 칩은 숨긴다(중복 방지). */}
      <div className="min-w-0 pl-4 pr-2 py-3 sm:pl-5 sm:pr-3" role="cell">
        <EquipmentName item={item} onOpenCard={onOpenCard} showTypeChip={false} />
      </div>
      <div
        className="flex min-w-0 items-center px-2 py-3 sm:px-3"
        role="cell"
      >
        <ItemTypeChip item={item} />
      </div>
      <div
        className="min-w-0 whitespace-nowrap px-2 py-3 text-right font-bold tabular-nums text-zinc-900 dark:text-white sm:px-3"
        role="cell"
      >
        {buyPrice.toLocaleString()}G
      </div>
      <div
        className="min-w-0 whitespace-nowrap px-2 py-3 text-right tabular-nums text-xs text-zinc-500 dark:text-zinc-400 sm:px-3"
        role="cell"
      >
        {item.power}
        <span className="text-zinc-400 dark:text-zinc-500">
          {" "}
          / {item.weight}
        </span>
      </div>
      <div className="min-w-0 px-2 py-3 text-right sm:px-3" role="cell">
        <button
          type="button"
          onClick={() => onBuy(id)}
          disabled={busy || !affordable}
          title={`${buyPrice.toLocaleString()} G 에 구매`}
          className="inline-flex h-7 min-w-[3.25rem] items-center justify-center whitespace-nowrap rounded-md border border-emerald-600 bg-emerald-600 px-2 py-1 text-xs font-medium leading-none text-white transition disabled:cursor-not-allowed disabled:opacity-50 hover:bg-emerald-700"
        >
          {busy ? "…" : "구매"}
        </button>
      </div>
    </div>
  );
}

function SellEquipmentRow({
  id,
  count,
  equipped,
  busy,
  onSell,
  onOpenCard,
}: {
  id: V2EquipmentId;
  count: number;
  equipped: boolean;
  busy: boolean;
  onSell: (id: V2EquipmentId) => void;
  onOpenCard: (item: V2Equipment, anchor: ItemCardAnchor) => void;
}) {
  const item = V2_EQUIPMENT[id];
  // 판매가는 sellPriceOf(구매가 5%, 티어 무관) — 상점 미판매(드랍 전용 T3/T5)도 팔 수 있다.
  const sellPrice = sellPriceOf(item) ?? 0;
  // 장착 중인 장비는 마지막 1개를 팔 수 없다 (여분이 있으면 여분만 판매 가능).
  const locked = equipped && count <= 1;
  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-x-3 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <EquipmentName item={item} count={count} onOpenCard={onOpenCard} />
        {equipped && (
          <span className="shrink-0 rounded bg-sky-100 px-1 py-px text-[10px] font-semibold text-sky-700 dark:bg-sky-950 dark:text-sky-300">
            장착 중
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => onSell(id)}
        disabled={busy || count <= 0 || locked}
        title={
          locked
            ? "장착 중인 장비는 판매할 수 없습니다"
            : `${sellPrice.toLocaleString()} G 에 판매`
        }
        className="justify-self-end rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 transition disabled:cursor-not-allowed disabled:opacity-30 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        {busy ? "…" : locked ? "장착 중" : `판매 +${sellPrice.toLocaleString()}`}
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
