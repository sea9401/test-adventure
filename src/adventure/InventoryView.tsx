"use client";

import { useEffect, useState } from "react";
import { Diamond, Flask, Scroll, Sparkle, Sword } from "@phosphor-icons/react";
import {
  BONUS_KEYS,
  BONUS_LABELS,
  findItemId,
  rarityTextClass,
  type EquipBonus,
  type EquipItem,
  type EquipSlot,
  type ItemId,
} from "./data/items";
import {
  craftTierSuffix,
  craftTierTextClass,
  type CraftTier,
} from "./data/craftQuality";
import {
  dropQualityPrefix,
  dropQualityTextClass,
  type DropQuality,
} from "./data/dropQuality";
import {
  buildEquipEntries,
  type EquipEntry,
} from "./inventory/equipEntries";
import { MATERIALS, type MaterialId } from "./data/materials";
import {
  ENCHANT_AFFIX_IDS,
  ENCHANT_AFFIXES,
  type EnchantAffix,
} from "./character/enchant";
import { POTIONS, POTION_IDS, potionMax } from "./data/potions";
import { CONSUMABLES, CONSUMABLE_IDS } from "./data/consumables";
import { SKILL_BOOKS, SKILL_BOOK_IDS, type SkillBookId } from "./data/skillBooks";
import { getAPSkillById } from "./character/apSkills";
import type { InventoryState } from "./inventory/useInventory";
import type { EquippedItem, EquippedSlots } from "./character/types";
import { enhanceAttemptStatus } from "./character/enhancement";
import { EquippedGrid } from "./character/CharacterMini";
import { EnchantBadges } from "./character/EnchantBadges";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { TabBar } from "@/components/ui/TabBar";
import { Pagination } from "@/components/ui/Pagination";
import { LIST_ROW } from "@/components/ui/listRow";
import { usePagination } from "@/lib/usePagination";
import {
  getItemTier,
  groupByTier,
  matchesEquipQuery,
  useTierToggle,
} from "@/adventure/equipment/tier";
import { EquipmentSearchInput } from "@/adventure/equipment/EquipmentSearchInput";
import { TierSectionHeader } from "@/adventure/equipment/TierSectionHeader";

type InvTabKey =
  | "equipment"
  | "materials"
  | "enchants"
  | "potions"
  | "consumables"
  | "skillBooks";

const TABS: { key: InvTabKey; label: string }[] = [
  { key: "equipment", label: "장비" },
  { key: "materials", label: "재료" },
  { key: "enchants", label: "부여서" },
  { key: "potions", label: "포션" },
  { key: "consumables", label: "소모품" },
  { key: "skillBooks", label: "스킬북" },
];

// 부여서 효과 수치 range 표기 — EnchantDialog 와 동일 포맷.
function fmtEnchantRange(affix: EnchantAffix): string {
  const [min, max] = affix.range;
  return `${min}~${max}${affix.unit === "percent" ? "%" : ""}`;
}

const SLOT_TABS: { key: EquipSlot; label: string }[] = [
  { key: "weapon", label: "무기" },
  { key: "armor", label: "방어구" },
  { key: "accessory", label: "장신구" },
];

// 같은 슬롯에 장착 중인 게 이 entry 와 동종(id + 제작 등급 + 드랍 등급 일치)인지 — 동종 여분이면 표시상 "장착중".
// 인스턴스 기반(별빛 재단 무구) 은 instanceId 가 정확히 일치해야 같은 인스턴스 — 두 자루가 같은 +N
// 라도 다른 한 자루로 본다.
function isEntryEquipped(
  entry: EquipEntry,
  current: EquippedItem | null | undefined,
): boolean {
  if (findItemId(current ?? null) !== entry.id) return false;
  if (entry.instanceId || current?.instanceId) {
    return entry.instanceId === current?.instanceId;
  }
  if ((current?.craftTier ?? 0) !== (entry.tier ?? 0)) return false;
  return (current?.dropQuality ?? 0) === (entry.quality ?? 0);
}

function computeDiff(
  next: EquipItem,
  current: EquipItem | null | undefined,
): { key: keyof EquipBonus; label: string; delta: number }[] {
  const cur = current?.bonus ?? {};
  const nxt = next.bonus ?? {};
  return BONUS_KEYS.flatMap((k) => {
    const delta = (nxt[k] ?? 0) - (cur[k] ?? 0);
    if (delta === 0) return [];
    return [{ key: k, label: BONUS_LABELS[k], delta }];
  });
}

export function InventoryView({
  inventory,
  equipped,
  learnedAPSkillNames,
  onEquip,
  onEquipInstance,
  onUnequip,
  onUseSkillBook,
}: {
  inventory: InventoryState;
  equipped?: EquippedSlots;
  /** 학습한 AP 스킬 이름 (소문자 비교용 X — 그대로 매칭). 스킬북 사용 버튼 비활성화 판단용. */
  learnedAPSkillNames?: ReadonlyArray<string>;
  onEquip?: (id: ItemId, tier?: CraftTier, quality?: DropQuality) => void;
  /** 인스턴스 기반 장비 장착. 미지정이면 인스턴스 entry 의 장착 버튼이 숨겨진다. */
  onEquipInstance?: (instanceId: string) => void;
  onUnequip?: (slot: EquipSlot) => void;
  /** 스킬북 사용 — 호출 측이 인벤 소비 + 학습 + 알림 처리. 미지정이면 버튼 숨김. */
  onUseSkillBook?: (id: SkillBookId) => void;
}) {
  const [tab, setTab] = useState<InvTabKey>("equipment");
  const [equipSlotTab, setEquipSlotTab] = useState<EquipSlot>("weapon");
  const [equipQuery, setEquipQuery] = useState("");

  const ownedEquipment = buildEquipEntries(inventory);
  // 각 카테고리는 기본적으로 이름순(가나다)으로 표시 — 정의 객체 키 순서 대신 localeCompare.
  // 부여서(enchant_*)는 전용 "부여서" 탭에서 카탈로그로 보여주므로 재료 탭에서는 제외 —
  // 일반 제작 재료에 20종이 섞여 흩어지던 걸 분리한다.
  const ownedMaterials = (Object.keys(MATERIALS) as MaterialId[])
    .filter((id) => !id.startsWith("enchant_"))
    .map((id) => ({
      id,
      material: MATERIALS[id],
      count: inventory.materials[id] ?? 0,
    }))
    .filter((e) => e.count > 0)
    .sort((a, b) => a.material.name.localeCompare(b.material.name));
  // 부여서 카탈로그 — 표시 순서 = 카탈로그 순서. 보유 0 도 회색으로 같이 보여 가이드 역할
  // (EnchantDialog 와 동일 정책). 별빛 사냥터 보스 드랍 / 거래소에서 모은다.
  const enchantRows = ENCHANT_AFFIX_IDS.map((id) => {
    const affix = ENCHANT_AFFIXES[id];
    // materialId 는 `enchant_<id>` 컨벤션으로 항상 유효한 MaterialId (materials.ts 에 정의).
    const count = inventory.materials[affix.materialId as MaterialId] ?? 0;
    return { affix, count };
  });
  const ownedEnchantKinds = enchantRows.filter((e) => e.count > 0).length;
  const ownedPotions = POTION_IDS.map((id) => ({
    id,
    potion: POTIONS[id],
    count: inventory.potions[id] ?? 0,
  }))
    .filter((e) => e.count > 0)
    .sort((a, b) => a.potion.name.localeCompare(b.potion.name));
  const ownedConsumables = CONSUMABLE_IDS.map((id) => ({
    id,
    consumable: CONSUMABLES[id],
    count: inventory.consumables[id] ?? 0,
  }))
    .filter((e) => e.count > 0)
    .sort((a, b) => a.consumable.name.localeCompare(b.consumable.name));
  const ownedSkillBooks = SKILL_BOOK_IDS.map((id) => ({
    id,
    book: SKILL_BOOKS[id],
    count: (inventory.skillBooks ?? {})[id] ?? 0,
  }))
    .filter((e) => e.count > 0)
    .sort((a, b) => a.book.name.localeCompare(b.book.name));
  const learnedSet = new Set(learnedAPSkillNames ?? []);
  const potionCap = potionMax(inventory.potionCapacityBonus ?? 0);

  // 슬롯 탭 + 이름 검색으로 필터, 진행 티어로 그룹화 — 페이저 대신 티어 헤더가 자연 분할.
  // 이름순(가나다) 정렬 후 그룹화하므로 각 티어 안에서 이름순으로 나열된다.
  const filteredEquipment = ownedEquipment
    .filter(
      (e) =>
        e.item.slot === equipSlotTab && matchesEquipQuery(e.item, equipQuery),
    )
    .sort((a, b) => a.item.name.localeCompare(b.item.name));
  // 동종 여분이 여러 개여도 "장착중" 표시는 딱 하나에만 — 첫 매칭 entry 의 key.
  const equippedEntryKey =
    filteredEquipment.find((e) =>
      isEntryEquipped(e, equipped?.[e.item.slot] ?? null),
    )?.key ?? null;
  const groupedEquipment = groupByTier(filteredEquipment, (e) =>
    getItemTier(e.id),
  );
  // 티어 접기/펴기 — 기본 접힘. 검색 활성 시 강제 펼침.
  const {
    isExpanded: isTierExpanded,
    toggle: toggleTier,
    expand: expandTier,
  } = useTierToggle();
  const equipSearching = equipQuery.trim().length > 0;
  // 현 슬롯에 장착 중인 아이템의 tier — 슬롯 진입/장비 교체 시 그 섹션을 자동 펼침(이후 사용자가 접을 수 있음).
  const equippedTier = equipped?.[equipSlotTab]
    ? getItemTier(findItemId(equipped[equipSlotTab]) ?? null)
    : null;
  useEffect(() => {
    if (equippedTier !== null) expandTier(equippedTier);
  }, [equipSlotTab, equippedTier, expandTier]);
  const materialsPager = usePagination(ownedMaterials, 12);
  const potionsPager = usePagination(ownedPotions, 12);
  const consumablesPager = usePagination(ownedConsumables, 12);
  const skillBooksPager = usePagination(ownedSkillBooks, 12);

  return (
    <div className="space-y-3">
      <TabBar
        tabs={TABS}
        active={tab}
        onChange={setTab}
        ariaLabel="가방 탭"
        scrollable
      />

      {tab === "equipment" && equipped && (
        <Card as="section" padding="none">
          <div className="space-y-3 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              장착중
            </h3>
            <EquippedGrid equipped={equipped} onUnequip={onUnequip} />
          </div>
        </Card>
      )}

      {tab === "equipment" &&
        (ownedEquipment.length === 0 ? (
          <EmptyState
            icon={<Sword size={40} weight="duotone" />}
            title="보유한 장비가 없습니다"
            message="제작·의뢰·드랍으로 장비를 모아 보세요."
          />
        ) : (
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              보유 장비
            </h3>
            <TabBar
              tabs={SLOT_TABS}
              active={equipSlotTab}
              onChange={setEquipSlotTab}
              ariaLabel="장비 슬롯 탭"
              size="sm"
            />
            <EquipmentSearchInput
              value={equipQuery}
              onChange={setEquipQuery}
            />
            {filteredEquipment.length === 0 ? (
              <p className="px-1 py-3 text-xs text-zinc-500 dark:text-zinc-400">
                {equipQuery
                  ? `“${equipQuery}” — 일치하는 장비가 없습니다.`
                  : "해당 종류의 장비가 없습니다."}
              </p>
            ) : (
              groupedEquipment.map(({ tier, meta, entries }) => {
                const open = equipSearching || isTierExpanded(tier);
                return (
                <div key={tier} className="space-y-1.5">
                  <TierSectionHeader
                    meta={meta}
                    count={entries.length}
                    expanded={open}
                    onToggle={() => toggleTier(tier)}
                  />
                  {open && (
                  <ul className="space-y-1.5">
                    {entries.map((entry) => {
                      const { key, id, tier: craftTier, quality, item } = entry;
                      const current = equipped?.[item.slot] ?? null;
                      const isEquipped = key === equippedEntryKey;
                      const diff = isEquipped
                        ? []
                        : computeDiff(item, current);
                      const suffix = craftTierSuffix(craftTier);
                      const prefix = dropQualityPrefix(quality).trim();
                      const enhanceSuffix =
                        entry.enhancementLevel && entry.enhancementLevel > 0
                          ? ` +${entry.enhancementLevel}`
                          : "";
                      // 별빛 무구(인스턴스) 한정 — 남은 강화 시도 횟수. +풀강은 +N 표기로 갈음.
                      const attemptInfo =
                        entry.instanceId &&
                        typeof entry.remainingAttempts === "number"
                          ? enhanceAttemptStatus(
                              entry.enhancementLevel ?? 0,
                              entry.remainingAttempts,
                            )
                          : null;
                      return (
                        <li key={key} className={`flex items-start gap-2 ${LIST_ROW}`}>
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex flex-wrap items-baseline gap-x-1.5">
                              {prefix && (
                                <span className={`text-xs ${dropQualityTextClass(quality)}`}>
                                  {prefix}
                                </span>
                              )}
                              <span
                                className={`text-sm font-medium ${
                                  quality ? dropQualityTextClass(quality) : rarityTextClass(item)
                                }`}
                              >
                                {item.name}
                              </span>
                              {suffix && (
                                <span className={`text-xs ${craftTierTextClass(craftTier)}`}>
                                  {suffix.trim()}
                                </span>
                              )}
                              {enhanceSuffix && (
                                <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                                  {enhanceSuffix.trim()}
                                </span>
                              )}
                              {attemptInfo && attemptInfo.status !== "max" && (
                                <span
                                  className={`text-[11px] ${
                                    attemptInfo.status === "exhausted"
                                      ? "text-zinc-400 dark:text-zinc-500"
                                      : "text-amber-600/80 dark:text-amber-400/80"
                                  }`}
                                >
                                  {attemptInfo.label}
                                </span>
                              )}
                              {isEquipped && (
                                <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                                  장착중
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                              <span className="text-xs text-amber-600 dark:text-amber-400">
                                {item.stats.map((s) => `${s.label} ${s.value}`).join(" · ")}
                              </span>
                              {!isEquipped && diff.length > 0 && (
                                <span className="inline-flex flex-wrap items-baseline gap-x-1.5 text-[11px]">
                                  <span className="text-zinc-400 dark:text-zinc-500">장착 시</span>
                                  {diff.map((d) => (
                                    <span
                                      key={d.key}
                                      className={
                                        d.delta > 0
                                          ? "tabular-nums text-emerald-600 dark:text-emerald-400"
                                          : "tabular-nums text-rose-600 dark:text-rose-400"
                                      }
                                    >
                                      {d.label}
                                      {d.delta > 0 ? "+" : ""}
                                      {d.delta}
                                    </span>
                                  ))}
                                </span>
                              )}
                            </div>
                            <EnchantBadges slots={entry.enchantSlots} />
                          </div>
                          <div className="flex shrink-0 items-center gap-1 pt-0.5">
                            {entry.instanceId
                              ? onEquipInstance && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onEquipInstance(entry.instanceId!)
                                    }
                                    disabled={isEquipped}
                                    className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                                  >
                                    {isEquipped ? "장착중" : "장착"}
                                  </button>
                                )
                              : onEquip && (
                                  <button
                                    type="button"
                                    onClick={() => onEquip(id, craftTier, quality)}
                                    disabled={isEquipped}
                                    className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                                  >
                                    {isEquipped ? "장착중" : "장착"}
                                  </button>
                                )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  )}
                </div>
                );
              })
            )}
          </section>
        ))}

      {tab === "materials" &&
        (ownedMaterials.length === 0 ? (
          <EmptyState
            icon={<Diamond size={40} weight="duotone" />}
            title="보유한 재료가 없습니다"
            message="상점에서 사거나 모험 중에 모을 수 있습니다."
          />
        ) : (
          <section className="space-y-2">
            <ul className="space-y-1.5">
              {materialsPager.pageItems.map(({ id, material, count }) => (
                <li key={id} className={LIST_ROW}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {material.name}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                      ×{count}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {material.description}
                  </p>
                </li>
              ))}
            </ul>
            <Pagination
              page={materialsPager.page}
              pageCount={materialsPager.pageCount}
              setPage={materialsPager.setPage}
            />
          </section>
        ))}

      {tab === "enchants" && (
        <section className="space-y-2">
          <p className="px-1 text-xs text-zinc-500 dark:text-zinc-400">
            별빛 무구 마법부여에 쓰는 부여서다. 별빛 사냥터 보스에서 떨어지거나
            거래소에서 모은다. 보유 {ownedEnchantKinds}종 / 전체{" "}
            {enchantRows.length}종.
          </p>
          {ownedEnchantKinds === 0 ? (
            <EmptyState
              icon={<Sparkle size={40} weight="duotone" />}
              title="보유한 부여서가 없습니다"
              message="별빛 사냥터 보스를 처치하면 떨어집니다."
            />
          ) : (
            <ul className="space-y-1.5">
              {enchantRows.map(({ affix, count }) => {
                const owned = count > 0;
                return (
                  <li
                    key={affix.id}
                    className={`${LIST_ROW} ${owned ? "" : "opacity-40"}`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {affix.name} 부여서
                      </span>
                      <span className="flex shrink-0 items-baseline gap-1.5 text-xs tabular-nums">
                        <span className="text-zinc-400 dark:text-zinc-500">
                          {fmtEnchantRange(affix)}
                        </span>
                        <span className="text-zinc-500 dark:text-zinc-400">
                          ×{count}
                        </span>
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {affix.description}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {tab === "potions" &&
        (ownedPotions.length === 0 ? (
          <EmptyState
            icon={<Flask size={40} weight="duotone" />}
            title="보유한 포션이 없습니다"
            message="상점에서 구매할 수 있습니다."
          />
        ) : (
          <section className="space-y-2">
            <ul className="space-y-1.5">
              {potionsPager.pageItems.map(({ id, potion, count }) => (
                <li key={id} className={LIST_ROW}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {potion.name}
                    </span>
                    <span
                      className={`shrink-0 text-xs tabular-nums ${
                        count >= potionCap
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-zinc-500 dark:text-zinc-400"
                      }`}
                    >
                      {count} / {potionCap}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {potion.description}
                  </p>
                </li>
              ))}
            </ul>
            <Pagination
              page={potionsPager.page}
              pageCount={potionsPager.pageCount}
              setPage={potionsPager.setPage}
            />
          </section>
        ))}

      {tab === "consumables" &&
        (ownedConsumables.length === 0 ? (
          <EmptyState
            icon={<Scroll size={40} weight="duotone" />}
            title="보유한 소모품이 없습니다"
            message="상점에서 구매할 수 있습니다."
          />
        ) : (
          <section className="space-y-2">
            <p className="px-1 text-xs text-zinc-500 dark:text-zinc-400">
              지도에서 가본 마을을 선택하면 자동으로 사용됩니다.
            </p>
            <ul className="space-y-1.5">
              {consumablesPager.pageItems.map(({ id, consumable, count }) => (
                <li key={id} className={LIST_ROW}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {consumable.name}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                      ×{count}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {consumable.description}
                  </p>
                </li>
              ))}
            </ul>
            <Pagination
              page={consumablesPager.page}
              pageCount={consumablesPager.pageCount}
              setPage={consumablesPager.setPage}
            />
          </section>
        ))}
      {tab === "skillBooks" &&
        (ownedSkillBooks.length === 0 ? (
          <EmptyState
            icon={<Scroll size={40} weight="duotone" />}
            title="보유한 스킬북이 없습니다"
            message="모험으로 발견하거나 NPC 에게 구매할 수 있습니다."
          />
        ) : (
          <section className="space-y-2">
            <p className="px-1 text-xs text-zinc-500 dark:text-zinc-400">
              사용하면 1권이 소비되며 AP 스킬을 영구 학습합니다.
            </p>
            <ul className="space-y-1.5">
              {skillBooksPager.pageItems.map(({ id, book, count }) => {
                const apSkill = getAPSkillById(book.learnsSkillId);
                const alreadyLearned = apSkill
                  ? learnedSet.has(apSkill.name)
                  : false;
                return (
                  <li key={id} className={LIST_ROW}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {book.name}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                        ×{count}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {book.description}
                    </p>
                    {onUseSkillBook && (
                      <button
                        type="button"
                        disabled={alreadyLearned}
                        onClick={() => onUseSkillBook(id)}
                        className="mt-2 inline-flex items-center rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-800 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900"
                      >
                        {alreadyLearned ? "이미 학습됨" : "사용 (학습)"}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            <Pagination
              page={skillBooksPager.page}
              pageCount={skillBooksPager.pageCount}
              setPage={skillBooksPager.setPage}
            />
          </section>
        ))}
    </div>
  );
}
