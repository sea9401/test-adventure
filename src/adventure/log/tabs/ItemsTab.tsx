"use client";

import { useMemo, useState } from "react";
import { Diamond } from "@phosphor-icons/react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { TabBar } from "@/components/ui/TabBar";
import { Pagination } from "@/components/ui/Pagination";
import { usePagination } from "@/lib/usePagination";
import {
  ITEMS,
  rarityTextClass,
  type EquipItem,
  type EquipSlot,
  type ItemId,
  type ItemRarity,
} from "@/adventure/data/items";
import { getRecipeById } from "@/adventure/data/recipes";
import { dropQualityPrefix, dropQualityTextClass } from "@/adventure/data/dropQuality";
import { craftTierTextClass } from "@/adventure/data/craftQuality";
import type { DiscoveredEquipmentEntry } from "@/adventure/log/storage";
import type {
  InventoryState,
  VaultState,
} from "@/adventure/inventory/useInventory";
import { inventoryCountFor } from "@/adventure/inventory/vaultOps";
import type { CraftTier } from "@/adventure/data/craftQuality";
import type { DropQuality } from "@/adventure/data/dropQuality";
import {
  parseVariantKey,
  resolveVariant,
  variantDisplayName,
  variantGradeLabel,
} from "@/adventure/log/discoveredEquipment";
import {
  getItemTier,
  groupByTier,
  matchesEquipQuery,
  useTierToggle,
} from "@/adventure/equipment/tier";
import { EquipmentSearchInput } from "@/adventure/equipment/EquipmentSearchInput";
import { TierSectionHeader } from "@/adventure/equipment/TierSectionHeader";

// 모험의 서 → 아이템 탭. 한 번이라도 보유/장착한 적 있는 장비를 슬롯별 sub-tab 으로(폐기해도 유지),
// 학습한 제작법을 마지막 sub-tab 으로. 인벤토리 액션 패널이 아니라 도감 — 장착 버튼 등은 없고 정보만.
type ItemSubTab = "weapon" | "armor" | "accessory" | "recipe";

const ITEM_SUB_TABS: { key: ItemSubTab; label: string }[] = [
  { key: "weapon", label: "무기" },
  { key: "armor", label: "방어구" },
  { key: "accessory", label: "장신구" },
  { key: "recipe", label: "제작법" },
];

const SLOT_EMOJI: Record<EquipSlot, string> = {
  weapon: "⚔️",
  armor: "🛡️",
  accessory: "💍",
};

export function ItemsTab({
  knownRecipes,
  shareableRecipes,
  discovered,
  vault,
  inventory,
  onWithdraw,
  onDeposit,
}: {
  knownRecipes: string[];
  shareableRecipes: string[];
  discovered: Record<string, DiscoveredEquipmentEntry>;
  vault?: VaultState;
  /** 인벤 카운트 산출용 — 인벤 보유분이 있어야 "보관" 버튼이 활성화된다. */
  inventory?: InventoryState;
  /** 도감 보관함에서 꺼내기 — vault[id][variantKey] 의 1개를 인벤으로 환원. */
  onWithdraw?: (id: ItemId, variantKey: string) => void;
  /** 인벤 보유분을 도감 보관함에 넣기 — 1개 차감 후 vault 에 +1. */
  onDeposit?: (id: ItemId, tier?: CraftTier, quality?: DropQuality) => void;
}) {
  const [sub, setSub] = useState<ItemSubTab>("weapon");

  return (
    <div className="space-y-3">
      <TabBar
        tabs={ITEM_SUB_TABS}
        active={sub}
        onChange={setSub}
        ariaLabel="아이템 종류"
        size="sm"
      />
      {sub === "recipe" ? (
        <RecipesSubTab
          knownRecipes={knownRecipes}
          shareableRecipes={shareableRecipes}
        />
      ) : (
        <EquipmentSubTab
          slot={sub}
          discovered={discovered}
          vault={vault ?? {}}
          inventory={inventory}
          onWithdraw={onWithdraw}
          onDeposit={onDeposit}
        />
      )}
    </div>
  );
}

type DiscoveredRow = {
  id: ItemId;
  variantKey: string;
  item: EquipItem;
  name: string;
  grade: string | null;
};

// 등급 오름차순 정렬 키. ItemRarity 미지정은 common 취급(== 0). PlacesTab 의 적정레벨 오름차순과 동일한 방향.
const RARITY_ORDER: Record<ItemRarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  unique: 3,
  legendary: 4,
};

// 같은 아이템의 변형끼리 묶일 때 내부 정렬 키 — 조잡한(-2) → 불량한(-1) → base(0) → 정교한/걸작(+1) → 빼어난(+2).
function variantTierOrder(key: string): number {
  const p = parseVariantKey(key);
  if (!p || p.kind === "base") return 0;
  if (p.kind === "crafted") return p.tier;
  return p.quality;
}

// 도감 등록분 → 표시 행 목록. (itemId × 변형) 한 줄. 슬롯 필터 + 등급 → 이름 → 변형 등급 순 정렬.
function buildRows(
  discovered: Record<string, DiscoveredEquipmentEntry>,
  slot: EquipSlot,
): DiscoveredRow[] {
  const rows: DiscoveredRow[] = [];
  for (const [idStr, entry] of Object.entries(discovered)) {
    const id = idStr as ItemId;
    const baseDef = ITEMS[id];
    if (!baseDef || baseDef.slot !== slot) continue;
    for (const key of entry.variants) {
      const item = resolveVariant(id, key);
      if (!item) continue;
      rows.push({
        id,
        variantKey: key,
        item,
        name: variantDisplayName(id, key),
        grade: variantGradeLabel(key),
      });
    }
  }
  rows.sort((a, b) => {
    const ra = RARITY_ORDER[a.item.rarity ?? "common"];
    const rb = RARITY_ORDER[b.item.rarity ?? "common"];
    if (ra !== rb) return ra - rb;
    const baseA = ITEMS[a.id]?.name ?? a.id;
    const baseB = ITEMS[b.id]?.name ?? b.id;
    const byBaseName = baseA.localeCompare(baseB);
    if (byBaseName !== 0) return byBaseName;
    return variantTierOrder(a.variantKey) - variantTierOrder(b.variantKey);
  });
  return rows;
}

function gradeTextClass(key: string): string {
  const p = parseVariantKey(key);
  if (!p) return "";
  if (p.kind === "crafted") return craftTierTextClass(p.tier);
  if (p.kind === "dropped") return dropQualityTextClass(p.quality);
  return "";
}

function EquipmentSubTab({
  slot,
  discovered,
  vault,
  inventory,
  onWithdraw,
  onDeposit,
}: {
  slot: EquipSlot;
  discovered: Record<string, DiscoveredEquipmentEntry>;
  vault: VaultState;
  inventory?: InventoryState;
  onWithdraw?: (id: ItemId, variantKey: string) => void;
  onDeposit?: (id: ItemId, tier?: CraftTier, quality?: DropQuality) => void;
}) {
  const rows = useMemo(() => buildRows(discovered, slot), [discovered, slot]);
  const [query, setQuery] = useState("");
  // 검색 적용 후 진행 티어로 그룹화 — 이름 부분 일치 + 빈 티어 자동 생략.
  const filtered = useMemo(
    () => rows.filter((r) => matchesEquipQuery(r.item, query)),
    [rows, query],
  );
  const grouped = useMemo(
    () => groupByTier(filtered, (r) => getItemTier(r.id)),
    [filtered],
  );
  // 티어 접기/펴기 — 기본 접힘. 검색 활성 시 모든 가시 tier 강제 펼침.
  const { isExpanded, toggle } = useTierToggle();
  const searching = query.trim().length > 0;

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Diamond size={40} weight="duotone" />}
        title="아직 발견한 장비가 없습니다"
        message="제작·드랍·보상 등으로 한 번이라도 얻으면 폐기해도 여기에 영구 기록됩니다."
      />
    );
  }

  return (
    <div className="space-y-2">
      <EquipmentSearchInput value={query} onChange={setQuery} />
      {filtered.length === 0 ? (
        <p className="py-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
          “{query}” — 일치하는 장비가 없습니다.
        </p>
      ) : (
        grouped.map(({ tier, meta, entries }) => {
          const open = searching || isExpanded(tier);
          return (
            <div key={tier} className="space-y-2">
              <TierSectionHeader
                meta={meta}
                count={entries.length}
                expanded={open}
                onToggle={() => toggle(tier)}
              />
              {open &&
                entries.map((row) => {
                  const stored = vault[row.id]?.[row.variantKey] ?? 0;
                  const owned = inventory
                    ? inventoryCountFor(inventory, row.id, row.variantKey)
                    : 0;
                  const variant = parseVariantKey(row.variantKey);
                  const tier =
                    variant && variant.kind === "crafted" ? variant.tier : undefined;
                  const quality =
                    variant && variant.kind === "dropped" ? variant.quality : undefined;
                  const hasFooter = owned > 0 || stored > 0;
                  return (
                  <Card key={`${row.id}@${row.variantKey}`}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold">
                        {SLOT_EMOJI[row.item.slot]}{" "}
                        {quality ? (
                          // 드랍 수식어(접두어)만 품질 색, 이름은 rarity 색 유지.
                          <>
                            <span className={dropQualityTextClass(quality)}>
                              {dropQualityPrefix(quality)}
                            </span>
                            <span className={rarityTextClass(row.item)}>
                              {row.item.name}
                            </span>
                          </>
                        ) : (
                          <span
                            className={
                              row.grade
                                ? gradeTextClass(row.variantKey)
                                : rarityTextClass(row.item)
                            }
                          >
                            {row.name}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs text-amber-600 dark:text-amber-400">
                        {row.item.stats.map((s) => `${s.label} ${s.value}`).join(" · ")}
                      </span>
                    </div>
                    {row.item.description && (
                      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                        {row.item.description}
                      </p>
                    )}
                    {hasFooter && (
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {owned > 0 && (
                            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                              보유 {owned}
                            </span>
                          )}
                          {stored > 0 && (
                            <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-400">
                              보관 {stored}
                            </span>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {onDeposit && owned > 0 && (
                            <button
                              type="button"
                              onClick={() => onDeposit(row.id, tier, quality)}
                              title="이 장비 1개를 보관함으로 옮깁니다"
                              className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                            >
                              보관
                            </button>
                          )}
                          {onWithdraw && stored > 0 && (
                            <button
                              type="button"
                              onClick={() => onWithdraw(row.id, row.variantKey)}
                              title="보관함에서 1개를 가방으로 꺼냅니다"
                              className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                            >
                              꺼내기
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </Card>
                  );
                })}
            </div>
          );
        })
      )}
    </div>
  );
}

// 보유 제작법 — 학습한 제작서를 카드로. 거래 토큰 보유/소진 상태 같이 표기.
// 토큰 = 1 (거래 가능) / 0 (이미 공유에 사용 — 다시 습득해야 충전).
// 거래/우편 출처 학습은 토큰을 부여하지 않으므로 거래 횟수에 자연 상한이 생긴다.
function RecipesSubTab({
  knownRecipes,
  shareableRecipes,
}: {
  knownRecipes: string[];
  shareableRecipes: string[];
}) {
  const recipes = knownRecipes
    .map((id) => ({ id, def: getRecipeById(id) }))
    .filter((r): r is { id: string; def: NonNullable<typeof r.def> } => !!r.def)
    .sort((a, b) => a.def.name.localeCompare(b.def.name));
  const pager = usePagination(recipes, 10);

  if (recipes.length === 0) {
    return (
      <EmptyState
        icon={<Diamond size={40} weight="duotone" />}
        title="아직 학습한 제작서가 없습니다"
        message="NPC 보상이나 몬스터 드랍으로 제작서를 얻으면 여기에 표시됩니다."
      />
    );
  }

  return (
    <div className="space-y-2">
      {pager.pageItems.map(({ id, def }) => {
        const canShare = shareableRecipes.includes(id);
        return (
          <Card key={id}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                📜 {def.name}
              </span>
              <span
                className={
                  canShare
                    ? "shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-normal text-emerald-700 dark:text-emerald-400"
                    : "shrink-0 rounded-full bg-zinc-500/10 px-2 py-0.5 text-[11px] font-normal text-zinc-500 dark:text-zinc-400"
                }
                title={
                  canShare
                    ? "거래소 등록 또는 우편 첨부 가능"
                    : "이미 공유에 사용 — 다시 습득하면 충전됩니다"
                }
              >
                거래 {canShare ? 1 : 0}/1
              </span>
            </div>
            {def.description ? (
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                {def.description}
              </p>
            ) : null}
          </Card>
        );
      })}
      <Pagination
        page={pager.page}
        pageCount={pager.pageCount}
        setPage={pager.setPage}
      />
    </div>
  );
}
