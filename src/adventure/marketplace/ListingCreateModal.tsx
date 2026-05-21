"use client";

import { useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { TabBar } from "@/components/ui/TabBar";
import { ITEMS, rarityTextClass, type ItemId, type EquipItem } from "@/adventure/data/items";
import {
  craftTierSuffix,
  craftTierTextClass,
  type CraftTier,
} from "@/adventure/data/craftQuality";
import {
  dropQualityPrefix,
  dropQualityTextClass,
  type DropQuality,
} from "@/adventure/data/dropQuality";
import {
  MATERIALS,
  type MaterialId,
} from "@/adventure/data/materials";
import { RECIPES, type Recipe } from "@/adventure/data/recipes";
import {
  SKILL_BOOKS,
  type SkillBook,
  type SkillBookId,
} from "@/adventure/data/skillBooks";
import type { InventoryState } from "@/adventure/inventory/useInventory";
import type { EquipVariantKey } from "@/adventure/inventory/vaultOps";
import type { EquipmentInstance } from "@/adventure/inventory/equipmentInstances";
import {
  isStarlitRing,
  starlitRingStatsFromBonus,
} from "@/adventure/inventory/starlitRing";
import type { RemoteSave } from "@/lib/storage/remote";
import { createListing } from "./api";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";

// 서버 MARKETPLACE_FEE_RATE 와 동기화. 0 이면 수수료 표시 숨김.
const FEE_RATE = 0;
const PRICE_MAX = 999_999_999;

type Selection =
  | {
      kind: "equip";
      itemId: ItemId;
      def: EquipItem;
      variantKey: EquipVariantKey;
      craftTier?: CraftTier;
      dropQuality?: DropQuality;
      have: number;
    }
  | {
      kind: "material";
      itemId: MaterialId;
      def: (typeof MATERIALS)[MaterialId];
      have: number;
    }
  | { kind: "recipe"; itemId: string; def: Recipe }
  | { kind: "skill_book"; itemId: SkillBookId; def: SkillBook; have: number }
  | {
      // 인스턴스 매물(강화/부여 별빛 무구·고리) — instanceId 로 거래. 표시용 라벨 동봉.
      kind: "equip_instance";
      itemId: ItemId;
      def: EquipItem;
      instanceId: string;
      instance: EquipmentInstance;
      label: string;
    };

// 정렬용 등급 가치 — 같은 itemId 내에서 좋은 사본부터 노출.
// c2(걸작) > d2(빼어난) > c1(고급) > d1(정교한) > base > c-1(하급) > c-2(불량).
const VARIANT_RANK: Record<EquipVariantKey, number> = {
  c2: 6,
  d2: 5,
  c1: 4,
  d1: 3,
  base: 2,
  "c-1": 1,
  "c-2": 0,
};

export function ListingCreateModal({
  inventory,
  shareableRecipes,
  remote,
  onClose,
  onSuccess,
  onLocalDeduct,
  showError,
}: {
  inventory: InventoryState;
  // 공유 토큰을 보유한 레시피만 등록 가능 — 이미 공유에 쓴 건 다시 습득해야 등록 가능.
  shareableRecipes: string[];
  remote: RemoteSave;
  onClose: () => void;
  onSuccess: () => void;
  onLocalDeduct: (selection: Selection, quantity: number) => void;
  showError: (msg: string) => void;
}) {
  useEscapeKey(onClose);
  const contentRef = useRef<HTMLDivElement>(null);
  useModalA11y(contentRef);
  const [selection, setSelection] = useState<Selection | null>(null);
  // 입력 중 빈 값/임시 값을 허용하기 위해 string 으로 보관 — 검증은 submit 에서.
  const [quantity, setQuantity] = useState("1");
  const [price, setPrice] = useState("1");
  const [submitting, setSubmitting] = useState(false);

  // 등급별로 3 storage 모두 펼친다 — equipment(base) + craftedEquipment(c±N) + droppedEquipment(dN).
  // 장착 여부 필터는 두지 않는다 (인벤 스택 ≠ 장착 사본).
  // 정렬: itemId 이름 오름차순 → 같은 itemId 내에서는 VARIANT_RANK 내림차순.
  const equipOptions = useMemo<Selection[]>(() => {
    const out: Selection[] = [];
    const pushBase = (id: string, count: number) => {
      if (!count) return;
      const def = ITEMS[id as ItemId];
      if (!def) return;
      if ("tradable" in def && def.tradable === false) return;
      out.push({
        kind: "equip",
        itemId: id as ItemId,
        def,
        variantKey: "base",
        have: count,
      });
    };
    for (const [id, count] of Object.entries(inventory.equipment ?? {})) {
      pushBase(id, count ?? 0);
    }
    for (const [id, tierMap] of Object.entries(inventory.craftedEquipment ?? {})) {
      const def = ITEMS[id as ItemId];
      if (!def) continue;
      if ("tradable" in def && def.tradable === false) continue;
      for (const [tierKey, count] of Object.entries(tierMap ?? {})) {
        if (!count) continue;
        const t = Number(tierKey);
        if (t !== -2 && t !== -1 && t !== 1 && t !== 2) continue;
        out.push({
          kind: "equip",
          itemId: id as ItemId,
          def,
          variantKey: `c${t as -2 | -1 | 1 | 2}`,
          craftTier: t as CraftTier,
          have: count,
        });
      }
    }
    for (const [id, qMap] of Object.entries(inventory.droppedEquipment ?? {})) {
      const def = ITEMS[id as ItemId];
      if (!def) continue;
      if ("tradable" in def && def.tradable === false) continue;
      for (const [qKey, count] of Object.entries(qMap ?? {})) {
        if (!count) continue;
        const q = Number(qKey);
        if (q !== 1 && q !== 2) continue;
        out.push({
          kind: "equip",
          itemId: id as ItemId,
          def,
          variantKey: `d${q as 1 | 2}`,
          dropQuality: q as DropQuality,
          have: count,
        });
      }
    }
    // 인스턴스(강화/부여 별빛 무구·고리) — 한 자루마다 고유 매물. 라벨에 강화/부여/롤 요약.
    for (const inst of inventory.equipmentInstances ?? []) {
      const def = ITEMS[inst.itemId as keyof typeof ITEMS] as
        | EquipItem
        | undefined;
      if (!def) continue;
      if ("tradable" in def && def.tradable === false) continue;
      let label = def.name;
      if (inst.enhancementLevel > 0) label += ` +${inst.enhancementLevel}`;
      if (isStarlitRing(inst.itemId) && inst.rolledBonus) {
        label += ` (${starlitRingStatsFromBonus(inst.rolledBonus)
          .map((s) => `${s.label}${s.value}`)
          .join("·")})`;
      } else if (inst.enchantSlots && inst.enchantSlots.length > 0) {
        label += ` [부여 ${inst.enchantSlots.length}]`;
      }
      out.push({
        kind: "equip_instance",
        itemId: inst.itemId as ItemId,
        def,
        instanceId: inst.instanceId,
        instance: inst,
        label,
      });
    }
    return out.sort((a, b) => {
      const nameCmp = a.def.name.localeCompare(b.def.name);
      if (nameCmp !== 0) return nameCmp;
      if (a.kind !== "equip" || b.kind !== "equip") return 0;
      return VARIANT_RANK[b.variantKey] - VARIANT_RANK[a.variantKey];
    });
  }, [
    inventory.equipment,
    inventory.craftedEquipment,
    inventory.droppedEquipment,
    inventory.equipmentInstances,
  ]);

  const materialOptions = useMemo<Selection[]>(() => {
    const out: Selection[] = [];
    for (const [id, count] of Object.entries(inventory.materials ?? {})) {
      if (!count) continue;
      const def = MATERIALS[id as MaterialId];
      if (!def) continue;
      out.push({ kind: "material", itemId: id as MaterialId, def, have: count });
    }
    return out.sort((a, b) => a.def.name.localeCompare(b.def.name));
  }, [inventory.materials]);

  const recipeOptions = useMemo<Selection[]>(() => {
    const out: Selection[] = [];
    for (const r of RECIPES) {
      if (r.tradable === false) continue;
      if (!shareableRecipes.includes(r.id)) continue;
      out.push({ kind: "recipe", itemId: r.id, def: r });
    }
    return out.sort((a, b) => a.def.name.localeCompare(b.def.name));
  }, [shareableRecipes]);

  const skillBookOptions = useMemo<Selection[]>(() => {
    const out: Selection[] = [];
    for (const [id, count] of Object.entries(inventory.skillBooks ?? {})) {
      if (!count) continue;
      const def = SKILL_BOOKS[id as SkillBookId];
      if (!def || !def.tradable) continue;
      out.push({
        kind: "skill_book",
        itemId: id as SkillBookId,
        def,
        have: count,
      });
    }
    return out.sort((a, b) => a.def.name.localeCompare(b.def.name));
  }, [inventory.skillBooks]);

  const noItems =
    equipOptions.length === 0 &&
    materialOptions.length === 0 &&
    recipeOptions.length === 0 &&
    skillBookOptions.length === 0;

  const priceNum = Math.floor(Number(price)) || 0;
  const fee = Math.floor(priceNum * FEE_RATE);
  const sellerGets = Math.max(0, priceNum - fee);

  const submit = async () => {
    if (!selection) return;
    const priceN = Math.floor(Number(price));
    if (!Number.isInteger(priceN) || priceN < 1 || priceN > PRICE_MAX) {
      showError("가격은 1 이상의 정수여야 합니다.");
      return;
    }
    const qtyN =
      selection.kind === "material" ? Math.floor(Number(quantity)) : 1;
    if (
      selection.kind === "material" &&
      (!Number.isInteger(qtyN) || qtyN < 1 || qtyN > selection.have)
    ) {
      showError(`수량은 1~${selection.have} 사이여야 합니다.`);
      return;
    }
    setSubmitting(true);
    try {
      await createListing(remote, {
        itemKind: selection.kind === "equip_instance" ? "equip" : selection.kind,
        itemId: selection.itemId,
        variantKey: selection.kind === "equip" ? selection.variantKey : "base",
        quantity: qtyN,
        price: priceN,
        ...(selection.kind === "equip_instance"
          ? { instanceId: selection.instanceId }
          : {}),
      });
      onLocalDeduct(selection, qtyN);
      onSuccess();
    } catch (e) {
      showError(e instanceof Error ? e.message : "등록 실패");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="listing-create-title"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        ref={contentRef}
        onClick={(e) => e.stopPropagation()}
        className="no-scrollbar max-h-[85vh] w-full max-w-md overflow-y-auto rounded-lg border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
      >
        <h2
          id="listing-create-title"
          className="text-base font-semibold text-zinc-900 dark:text-zinc-100"
        >
          매물 등록
        </h2>

        {noItems ? (
          <div className="mt-4 text-sm text-zinc-500">
            거래 가능한 아이템이 없습니다. (장착 중·시작 장비·재료 0개는 제외)
          </div>
        ) : !selection ? (
          <ItemPicker
            equipOptions={equipOptions}
            materialOptions={materialOptions}
            recipeOptions={recipeOptions}
            skillBookOptions={skillBookOptions}
            onPick={(s) => {
              setSelection(s);
              setQuantity("1");
              setPrice(
                s.kind === "material"
                  ? String(Math.max(1, s.def.price))
                  : s.kind === "skill_book"
                    ? String(Math.max(1, s.def.price ?? 1))
                    : "1",
              );
            }}
          />
        ) : (
          <PriceForm
            selection={selection}
            quantity={quantity}
            price={price}
            onQuantity={setQuantity}
            onPrice={setPrice}
            fee={fee}
            sellerGets={sellerGets}
            onBack={() => setSelection(null)}
          />
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            닫기
          </button>
          {selection ? (
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="rounded-md border border-emerald-700 bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {submitting ? "등록 중…" : "등록"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type PickerTab = "equip" | "material" | "recipe" | "skill_book";

function ItemPicker({
  equipOptions,
  materialOptions,
  recipeOptions,
  skillBookOptions,
  onPick,
}: {
  equipOptions: Selection[];
  materialOptions: Selection[];
  recipeOptions: Selection[];
  skillBookOptions: Selection[];
  onPick: (s: Selection) => void;
}) {
  // 보유 0 인 카테고리는 탭에서 제외 — 클릭해도 빈 화면 보이는 경우 방지.
  const tabs = useMemo(() => {
    const out: { key: PickerTab; label: string }[] = [];
    if (equipOptions.length > 0)
      out.push({ key: "equip", label: `장비 ${equipOptions.length}` });
    if (materialOptions.length > 0)
      out.push({ key: "material", label: `재료 ${materialOptions.length}` });
    if (recipeOptions.length > 0)
      out.push({ key: "recipe", label: `제작서 ${recipeOptions.length}` });
    if (skillBookOptions.length > 0)
      out.push({
        key: "skill_book",
        label: `스킬북 ${skillBookOptions.length}`,
      });
    return out;
  }, [
    equipOptions.length,
    materialOptions.length,
    recipeOptions.length,
    skillBookOptions.length,
  ]);

  const [tab, setTab] = useState<PickerTab>(() => tabs[0]?.key ?? "equip");
  // tabs 가 바뀌어 현재 tab 이 무효화되면 첫 탭으로 폴백 (state 는 안 건드림 — 다음 렌더에서 정합).
  const activeTab = tabs.some((t) => t.key === tab) ? tab : tabs[0]?.key;

  const items =
    activeTab === "equip"
      ? equipOptions
      : activeTab === "material"
        ? materialOptions
        : activeTab === "skill_book"
          ? skillBookOptions
          : recipeOptions;

  return (
    <div className="mt-3 space-y-3">
      {tabs.length > 1 && (
        <TabBar
          tabs={tabs}
          active={activeTab ?? "equip"}
          onChange={setTab}
          ariaLabel="아이템 종류"
          size="sm"
        />
      )}
      <ul className="space-y-1">
        {items.map((o) => (
          <li key={pickerKey(o)}>
            <button
              type="button"
              onClick={() => onPick(o)}
              className="flex w-full items-center justify-between rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-left text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/60"
            >
              {o.kind === "equip" ? (
                <span>
                  <span className={dropQualityTextClass(o.dropQuality)}>
                    {dropQualityPrefix(o.dropQuality)}
                  </span>
                  <span className={rarityTextClass(o.def)}>{o.def.name}</span>
                  <span className={craftTierTextClass(o.craftTier)}>
                    {craftTierSuffix(o.craftTier)}
                  </span>
                </span>
              ) : o.kind === "equip_instance" ? (
                <span className={rarityTextClass(o.def)}>{o.label}</span>
              ) : (
                <span
                  className={
                    o.kind === "skill_book"
                      ? "text-violet-700 dark:text-violet-300"
                      : undefined
                  }
                >
                  {o.kind === "recipe" ? "📜 " : o.kind === "skill_book" ? "📖 " : ""}
                  {o.def.name}
                </span>
              )}
              <span className="text-xs text-zinc-500">
                {o.kind === "recipe"
                  ? "제작서"
                  : o.kind === "skill_book"
                    ? `${o.have}권 보유`
                    : o.kind === "equip_instance"
                      ? "고유 1"
                      : `${o.have}개 보유`}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// 같은 itemId 가 등급별로 여러 줄 노출되므로 grade 까지 포함해야 key 가 유니크.
function pickerKey(o: Selection): string {
  if (o.kind === "equip") return `equip-${o.itemId}-${o.variantKey}`;
  if (o.kind === "equip_instance") return `inst-${o.instanceId}`;
  return `${o.kind}-${o.itemId}`;
}

function PriceForm({
  selection,
  quantity,
  price,
  onQuantity,
  onPrice,
  fee,
  sellerGets,
  onBack,
}: {
  selection: Selection;
  quantity: string;
  price: string;
  onQuantity: (s: string) => void;
  onPrice: (s: string) => void;
  fee: number;
  sellerGets: number;
  onBack: () => void;
}) {
  return (
    <div className="mt-3 space-y-3">
      <Card padding="sm">
        <div className="flex items-center justify-between">
          {selection.kind === "equip" ? (
            <span className="text-sm font-medium">
              <span className={dropQualityTextClass(selection.dropQuality)}>
                {dropQualityPrefix(selection.dropQuality)}
              </span>
              <span className={rarityTextClass(selection.def)}>
                {selection.def.name}
              </span>
              <span className={craftTierTextClass(selection.craftTier)}>
                {craftTierSuffix(selection.craftTier)}
              </span>
            </span>
          ) : selection.kind === "equip_instance" ? (
            <span
              className={`text-sm font-medium ${rarityTextClass(selection.def)}`}
            >
              {selection.label}
            </span>
          ) : (
            <span
              className={`text-sm font-medium ${
                selection.kind === "skill_book"
                  ? "text-violet-700 dark:text-violet-300"
                  : ""
              }`}
            >
              {selection.kind === "recipe"
                ? "📜 "
                : selection.kind === "skill_book"
                  ? "📖 "
                  : ""}
              {selection.def.name}
            </span>
          )}
          <button
            type="button"
            onClick={onBack}
            className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            다른 아이템 선택
          </button>
        </div>
        <div className="mt-1 text-xs text-zinc-500">
          {selection.kind === "equip"
            ? `장비 · 보유 ${selection.have}개`
            : selection.kind === "material"
              ? `재료 · 보유 ${selection.have}개`
              : selection.kind === "skill_book"
                ? `스킬북 · 보유 ${selection.have}권`
                : "제작서 · 학습된 지식"}
        </div>
      </Card>

      {selection.kind === "material" ? (
        <label className="block">
          <span className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
            수량 (최대 {selection.have})
          </span>
          <input
            type="number"
            min={1}
            max={selection.have}
            value={quantity}
            onChange={(e) => onQuantity(e.target.value)}
            autoFocus
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
      ) : null}

      <label className="block">
        <span className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
          가격 (전체 거래액, G)
        </span>
        <input
          type="number"
          min={1}
          max={PRICE_MAX}
          value={price}
          onChange={(e) => onPrice(e.target.value)}
          autoFocus={selection.kind !== "material"}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>

      {fee > 0 ? (
        <div className="rounded-md bg-zinc-50 p-2 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
          성사 수수료 차감 후{" "}
          <strong>{sellerGets.toLocaleString()} G</strong> 수령 예정 (수수료{" "}
          {fee.toLocaleString()} G)
        </div>
      ) : null}
    </div>
  );
}
