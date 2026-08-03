"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { HeaderPanel } from "@/components/ui/HeaderPanel";
import { LoadErrorBanner } from "@/components/ui/LoadErrorBanner";
import { Coins } from "@phosphor-icons/react";
import { TabBar } from "@/components/ui/TabBar";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ItemTypeChip } from "@/components/ui/ItemTypeChip";
import {
  V2_EQUIPMENT,
  effectiveStats,
  shopPriceOf,
  shopPriceForSell,
  sellPriceOf,
  v2EquipStatRows,
  v2ItemTypeLabel,
  type V2Equipment,
  type V2EquipInstance,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";
import { rollQualityPct } from "@/adventure/data/v2/v2EquipVariance";
import {
  V2_MATERIALS,
  V2_MATERIAL_SELL_PRICE,
  materialSellPriceOf,
  type V2MaterialId,
} from "@/adventure/data/v2/dungeonDrops";
import {
  V2ItemCard,
  CraftQualityBadge,
  EnhanceLevelBadge,
  MasterworkBadge,
  QualityPctText,
  anchorOf,
  powerNameClass,
  type ItemCardAnchor,
} from "./V2ItemCard";
import { sortEquipInstances } from "./v2ItemListShared";
import { useGameState } from "./GameStateProvider";
import { useSingleFlightGuard } from "@/lib/useSingleFlight";
import { useSystemToast } from "./RewardToastProvider";

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
  "grid grid-cols-[minmax(0,1fr)_2.75rem_4.25rem_4.25rem_4rem] sm:grid-cols-[minmax(0,1fr)_4.5rem_6.5rem_6rem_5.25rem]";

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

// 카탈로그에 있어도 NPC 판매가가 없는 재료(강화석·재련석·제작
// 재료 등)는 거래소/소비처 전용이다. 판매 탭에 노출하면 undefined 단가가
// NaN으로 표시되므로 카탈로그와 공통 가격 판정을 모두 통과한 id만 후보로 둔다.
const MATERIAL_IDS = (Object.keys(V2_MATERIAL_SELL_PRICE) as V2MaterialId[])
  .filter((id) => V2_MATERIALS[id] && materialSellPriceOf(id) != null);

function shopErrorLabel(error: string | undefined, status: number, retryAfterSec?: number) {
  if (error === "rate_limited") {
    return `요청이 많습니다. ${Math.max(1, Math.floor(retryAfterSec ?? 1))}초 후 다시 시도하세요.`;
  }
  return error ?? `http ${status}`;
}

export function shopSellEquipmentInstances(
  owned: V2EquipInstance[],
  slot: SlotTab,
): V2EquipInstance[] {
  return sortEquipInstances(
    owned.filter((inst) => {
      const item = V2_EQUIPMENT[inst.id];
      return item?.slot === slot && shopPriceForSell(item) != null;
    }),
    "default",
  );
}

export function V2ShopView({ onBack }: { onBack: () => void }) {
  // 지불 게이트는 보유+은행(코어루프 on) — 은행 잔액은 로컬(이 화면의 me/state·구매 응답)로
  //   추적해 항상 신선하게 유지하고, 앱 전역(은행 패널 등)을 위해 컨텍스트도 함께 동기화한다.
  const { coreLoopOn, applyResourcePatch } = useGameState();
  const [gold, setGold] = useState<number>(0);
  const [bankedGold, setBankedGold] = useState<number>(0);
  // 지불 가능 총액 — flag off 면 보유만(===gold, prod 무변경), on 이면 보유+은행.
  const spendable = coreLoopOn ? gold + bankedGold : gold;
  // 장착 instance 가 있는 장비 id 집합 — 옵션 카드의 세트 착용 현황 표시용.
  const [equipped, setEquipped] = useState<Set<V2EquipmentId>>(new Set());
  // 개체 목록 + 장착 iid — 판매 목록과 서버 요청 모두 iid 단위로 유지한다.
  const [ownedInsts, setOwnedInsts] = useState<V2EquipInstance[]>([]);
  const [equippedIids, setEquippedIids] = useState<Set<string>>(new Set());
  const [materials, setMaterials] = useState<
    Partial<Record<V2MaterialId, number>>
  >({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const beginAction = useSingleFlightGuard();
  const { notifySystem } = useSystemToast();
  const [mode, setMode] = useState<Mode>("buy");
  const [loadError, setLoadError] = useState(false);
  const [subTab, setSubTab] = useState<SubTab>("weapon");
  // 클릭 시 뜨는 옵션 카드 팝오버 (장비 전용) — null 이면 닫힘.
  const [card, setCard] = useState<{
    item: V2Equipment;
    anchor: ItemCardAnchor;
    inst?: V2EquipInstance;
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
        ? ((await stateRes.json()) as {
            character?: { gold?: number; bankedGold?: number };
          })
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
      setBankedGold(stateJ?.character?.bankedGold ?? 0);
      applyResourcePatch({
        gold: stateJ?.character?.gold ?? 0,
        bankedGold: stateJ?.character?.bankedGold ?? 0,
      });
      const insts = equipJ?.owned ?? [];
      const eqIids = new Set(Object.values(equipJ?.equipped ?? {}));
      setOwnedInsts(insts);
      setEquippedIids(eqIids);
      // 장착 instance 가 있는 id 집합 — 옵션 카드의 세트 착용 현황용.
      setEquipped(
        new Set(insts.filter((i) => eqIids.has(i.iid)).map((i) => i.id)),
      );
      setMaterials(invJ?.materials ?? {});
    } catch {
      setLoadError(true);
    }
  }, [applyResourcePatch]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 1회 fetch(refresh 가 state 시드)
    refresh();
  }, [refresh]);

  const onModeChange = useCallback((m: Mode) => {
    setMode(m);
    setSubTab("weapon");
    setCard(null);
  }, []);

  const buy = useCallback(async (id: V2EquipmentId) => {
    const release = beginAction();
    if (!release) return;
    setBusyId(id);
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
            retryAfterSec?: number;
            gold?: number;
            bankedGold?: number;
            owned?: V2EquipInstance[];
          }
        | null;
      if (!j?.ok) {
        notifySystem(`✗ ${shopErrorLabel(j?.error, res.status, j?.retryAfterSec)}`);
        return;
      }
      const item = V2_EQUIPMENT[id];
      notifySystem(`✓ ${item.name} 구매`);
      const insts = j.owned ?? [];
      setOwnedInsts(insts);
      if (typeof j.gold === "number") setGold(j.gold);
      if (typeof j.bankedGold === "number") {
        setBankedGold(j.bankedGold);
      }
      applyResourcePatch({
        gold: typeof j.gold === "number" ? j.gold : undefined,
        bankedGold:
          typeof j.bankedGold === "number" ? j.bankedGold : undefined,
      });
    } catch (err) {
      notifySystem(`✗ ${(err as Error).message}`);
    } finally {
      release();
      setBusyId(null);
    }
  }, [applyResourcePatch, beginAction, notifySystem]);

  // 판매는 화면에서 고른 개체(iid)를 그대로 서버에 전달한다. 같은 이름의 장비라도 옵션·강화·
  // 제작 품질이 다르므로 카탈로그 id로 다시 골라서는 안 된다.
  const sellEquipment = useCallback(
    async (iid: string) => {
      const release = beginAction();
      if (!release) return;
      const inst = ownedInsts.find((candidate) => candidate.iid === iid);
      if (!inst) {
        release();
        notifySystem("✗ 판매할 개체가 없습니다");
        return;
      }
      setBusyId(iid);
      try {
        const res = await fetch("/api/v2/shop/equipment/sell", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ iid }),
        });
        const j = (await res.json().catch(() => null)) as
          | {
              ok?: boolean;
              error?: string;
              retryAfterSec?: number;
              gold?: number;
              owned?: V2EquipInstance[];
              sellPrice?: number;
            }
          | null;
        if (!j?.ok) {
          const reason =
            j?.error === "equipped"
              ? "장착 중인 장비는 판매할 수 없습니다"
              : j?.error === "locked"
                ? "잠금 해제 후 판매할 수 있습니다"
              : shopErrorLabel(j?.error, res.status, j?.retryAfterSec);
          notifySystem(`✗ ${reason}`);
          // 서버가 장착분 판매를 막았으면 화면 상태를 최신으로 맞춘다.
          if (j?.error === "equipped") refresh();
          return;
        }
        const item = V2_EQUIPMENT[inst.id];
        notifySystem(`✓ ${item.name} 판매 (+${j.sellPrice ?? 0} G)`);
        const insts = j.owned ?? [];
        setOwnedInsts(insts);
        if (typeof j.gold === "number") {
          setGold(j.gold);
          applyResourcePatch({ gold: j.gold });
        }
      } catch (err) {
        notifySystem(`✗ ${(err as Error).message}`);
      } finally {
        release();
        setBusyId(null);
      }
    },
    [
      ownedInsts,
      refresh,
      applyResourcePatch,
      beginAction,
      notifySystem,
    ],
  );

  // 재료는 보유 스택 전량을 한 번에 환금.
  const sellMaterial = useCallback(async (id: V2MaterialId) => {
    const release = beginAction();
    if (!release) return;
    setBusyId(id);
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
            retryAfterSec?: number;
            gold?: number;
            materials?: Partial<Record<V2MaterialId, number>>;
            sold?: { count: number; gold: number };
          }
        | null;
      if (!j?.ok) {
        notifySystem(`✗ ${shopErrorLabel(j?.error, res.status, j?.retryAfterSec)}`);
        return;
      }
      const mat = V2_MATERIALS[id];
      notifySystem(
        `✓ ${mat.name} ×${j.sold?.count ?? 0} 판매 (+${j.sold?.gold ?? 0} G)`,
      );
      setMaterials(j.materials ?? {});
      if (typeof j.gold === "number") {
        setGold(j.gold);
        applyResourcePatch({ gold: j.gold });
      }
    } catch (err) {
      notifySystem(`✗ ${(err as Error).message}`);
    } finally {
      release();
      setBusyId(null);
    }
  }, [applyResourcePatch, beginAction, notifySystem]);

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
  // 판매 목록 = 그 슬롯에서 보유 중인 판매 가능 개체. 같은 장비 id도 합치지 않으며 각 iid의
  // 옵션·강화·제작 품질을 그대로 보여준다.
  const sellEquipInsts = useMemo(() => {
    if (subTab === "material") return [];
    return shopSellEquipmentInstances(ownedInsts, subTab);
  }, [subTab, ownedInsts]);
  const ownedMaterialIds = useMemo(
    () => MATERIAL_IDS.filter((id) => (materials[id] ?? 0) > 0),
    [materials],
  );

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader
        title="상점"
        onBack={onBack}
        right={
          // 보유 골드 — 결제 가능 총액(spendable: 코어루프면 지갑+은행)을 표시. 구매 가능여부
          //   게이트(gold={spendable})와 일치 + 치료소·대장간 표기와 통일.
          <span className="flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-200">
            <Coins size={16} weight="fill" className="text-yellow-500" />
            <span className="font-semibold tabular-nums">
              {spendable.toLocaleString()}G
            </span>
          </span>
        }
      />
      {loadError && <LoadErrorBanner onRetry={refresh} />}

      {/* 탭(구매/판매 + 부위) — 지역 배경 위라 라이트모드 가독성 위해 surface 패널로 감쌈. */}
      <HeaderPanel className="space-y-1 py-2">
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
          scrollable
        />
      </HeaderPanel>

      <section>
        {mode === "buy" ? (
          <Card padding="none" className="overflow-hidden dark:border-zinc-700">
            <div className="text-sm">
              <div
                className={`${BUY_GRID_CLASS} border-b border-zinc-200 bg-zinc-100/60 text-[11px] text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-400`}
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
                    gold={spendable}
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
            <EmptyHint text="NPC에게 판매할 수 있는 재료가 없습니다." />
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
        ) : sellEquipInsts.length === 0 ? (
          <EmptyHint text="판매할 장비가 없습니다." />
        ) : (
          <Card padding="none" className="overflow-hidden">
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {sellEquipInsts.map((inst) => (
                <SellEquipmentRow
                  key={inst.iid}
                  inst={inst}
                  equipped={equippedIids.has(inst.iid)}
                  busy={busyId === inst.iid}
                  onSell={sellEquipment}
                  onOpenCard={(selected, anchor) =>
                    setCard({
                      item: V2_EQUIPMENT[selected.id],
                      inst: selected,
                      anchor,
                    })
                  }
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
          roll={card.inst?.roll}
          enhance={card.inst?.enhance}
          craftQuality={card.inst?.craftQuality}
          craftedBy={card.inst?.craftedBy}
          equippedIds={equipped}
        />
      )}
    </main>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-zinc-300 bg-white px-3 py-6 text-center text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
      {text}
    </div>
  );
}

// 장비 이름 영역 — 클릭 시 옵션 카드 팝오버. 구매/판매 행이 공유.
function EquipmentName({
  item,
  onOpenCard,
  showTypeChip = true,
}: {
  item: V2Equipment;
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
        <span
          className={`truncate text-sm font-semibold ${powerNameClass(item)}`}
        >
          {item.name}
        </span>
        {showTypeChip && <ItemTypeChip item={item} />}
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
      className={`ui-shop-row ${BUY_GRID_CLASS} items-center hover:bg-zinc-50 dark:hover:bg-zinc-800/60`}
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
        <span className="ui-price-pill">{buyPrice.toLocaleString()}G</span>
      </div>
      <div
        className="min-w-0 whitespace-nowrap px-2 py-3 text-right tabular-nums text-xs text-zinc-500 dark:text-zinc-400 sm:px-3"
        role="cell"
      >
        {item.power}
        <span className="text-zinc-400 dark:text-zinc-500">
          {" "}
          / {effectiveStats(item, undefined).weight}
        </span>
      </div>
      <div className="min-w-0 px-1 py-3 text-right sm:px-3" role="cell">
        <Button
          onClick={() => onBuy(id)}
          disabled={busy || !affordable}
          title={`${buyPrice.toLocaleString()} G 에 구매`}
          variant="success"
          size="xs"
          className="min-w-[2.75rem] whitespace-nowrap px-1.5 leading-none"
        >
          {busy ? "…" : "구매"}
        </Button>
      </div>
    </div>
  );
}

function SellEquipmentRow({
  inst,
  equipped,
  busy,
  onSell,
  onOpenCard,
}: {
  inst: V2EquipInstance;
  equipped: boolean;
  busy: boolean;
  onSell: (iid: string) => void;
  onOpenCard: (inst: V2EquipInstance, anchor: ItemCardAnchor) => void;
}) {
  const item = V2_EQUIPMENT[inst.id];
  // 판매가는 sellPriceOf(구매가 5%, 티어 무관) — 상점 미판매(드랍 전용 T3/T5)도 팔 수 있다.
  const sellPrice = sellPriceOf(item) ?? 0;
  const qualityPct = rollQualityPct(item, inst.roll);
  const statText = v2EquipStatRows(
    item,
    inst.roll,
    inst.enhance,
    inst.craftQuality,
  )
    .map((row) => `${row.label} ${row.value}`)
    .join(" · ");
  const protectedItem = equipped || inst.locked === true;
  return (
    <li className="ui-shop-row grid grid-cols-[1fr_auto] items-center gap-x-3 px-3 py-2.5">
      <button
        type="button"
        onClick={(event) => onOpenCard(inst, anchorOf(event.currentTarget))}
        className="min-w-0 rounded px-1 py-0.5 text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
        aria-label={`${item.name} 옵션 확인`}
      >
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span
            className={`truncate text-sm font-semibold ${powerNameClass(item, inst.roll, inst.enhance, inst.craftQuality)}`}
          >
            {item.name}
          </span>
          <ItemTypeChip item={item} />
          {qualityPct != null ? (
            <span className="text-[10px] font-semibold tabular-nums" title="품질">
              품질 <QualityPctText pct={qualityPct} />
            </span>
          ) : null}
          <EnhanceLevelBadge enhance={inst.enhance} />
          <CraftQualityBadge craftQuality={inst.craftQuality} />
          {inst.craftedBy?.masterwork ? <MasterworkBadge /> : null}
          {equipped ? (
            <span className="shrink-0 rounded bg-sky-100 px-1 py-px text-[10px] font-semibold text-sky-700 dark:bg-sky-950 dark:text-sky-300">
              장착 중
            </span>
          ) : null}
          {inst.locked ? (
            <span className="shrink-0 rounded bg-amber-100 px-1 py-px text-[10px] font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              잠금
            </span>
          ) : null}
        </span>
        <span className="mt-1 block line-clamp-2 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
          {statText || "옵션 없음"}
        </span>
      </button>
      <Button
        onClick={() => onSell(inst.iid)}
        disabled={busy || protectedItem}
        title={
          equipped
            ? "장착 중인 장비는 판매할 수 없습니다"
            : inst.locked
              ? "잠금 해제 후 판매할 수 있습니다"
            : `${sellPrice.toLocaleString()} G 에 판매`
        }
        variant="secondary"
        size="xs"
        className="justify-self-end disabled:opacity-30"
      >
        {busy
          ? "…"
          : equipped
            ? "장착 중"
            : inst.locked
              ? "잠금됨"
              : `판매 +${sellPrice.toLocaleString()}`}
      </Button>
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
  const unit = materialSellPriceOf(id);
  // 부모 목록에서 이미 거르지만, 가격표 변경/잘못된 직접 호출에서도
  // NaN 판매가를 절대 렌더하지 않도록 마지막으로 방어한다.
  if (unit == null) return null;
  const total = unit * count;
  return (
    <li className="ui-shop-row grid grid-cols-[1fr_auto] items-center gap-x-3 px-3 py-2.5">
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
      <Button
        onClick={() => onSell(id)}
        disabled={busy || count <= 0}
        title={`보유 ${count}개 전량 판매 (+${total.toLocaleString()} G)`}
        variant="secondary"
        size="xs"
        className="justify-self-end disabled:opacity-30"
      >
        {busy ? "…" : `전량 판매 +${total.toLocaleString()}`}
      </Button>
    </li>
  );
}
