"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Diamond } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { SURFACE_CARD } from "@/components/ui/surfaces";
import {
  RARE_MAP_KINDS,
  type RareMapInstance,
} from "@/adventure/data/v2/rareMaps";
import {
  MUSEUN_CASH_ITEMS,
  MUSEUN_UTILITY_ITEM_IDS,
  type MuseunCashItemCounts,
  type MuseunCashItemId,
} from "@/adventure/data/v2/museunCashItems";
import {
  SP_FRUIT,
  SP_FRUIT_TIERS,
  type SpFruitTier,
} from "@/adventure/data/v2/spFruit";
import {
  V2_MATERIALS,
  type V2MaterialId,
} from "@/adventure/data/v2/dungeonDrops";
import {
  COOP_ALL_EQUIPMENT_BOXES,
  COOP_MASTERY_TOME_GAIN,
  COOP_MASTERY_TOME_MATERIAL_ID,
} from "@/adventure/data/v2/coopRewards";
import {
  cookingFoodDefinition,
  cookingStatText,
  type CookingFoodId,
  type CookingFoodInventory,
} from "@/adventure/v2/cooking";
import {
  V2SimpleItemInfoCard,
  anchorOf,
  type ItemCardAnchor,
} from "../V2ItemCard";
import { InventoryItemIcon } from "./InventoryItemIcon";

function cashItemUseLabel(itemId: MuseunCashItemId): string {
  const effect = MUSEUN_CASH_ITEMS[itemId].effect;
  if (effect.kind === "profile_image") return "프로필 이미지 1회 변경";
  if (effect.kind === "rename") return "캐릭터 이름 1회 변경";
  if (effect.kind === "adventure_support") {
    return `모험 지원 혜택 ${effect.days}일`;
  }
  if (effect.kind === "profile_border_box") return "미보유 프로필 꾸미기 1종 확정";
  if (effect.kind === "chat_badge_box") return "미보유 채팅 배지 1종 확정";
  return "미보유 닉네임 꾸미기 1종 확정";
}

// 소모품 탭 — SP 열매 섹션 + 실제 소모품 목록. 레어맵은 사냥터 목록에서 표시한다.
export function RareMapsTab({
  materials,
  spFruitUsed,
  busy,
  onUseSpFruit,
  onUseEquipmentBox,
  onUseMasteryTome,
  rareMaps,
  cashItems,
  onUseCashItem,
  cookingFoods,
  onUseCookingFood,
}: {
  materials: Partial<Record<V2MaterialId, number>>;
  spFruitUsed: Record<SpFruitTier, number>;
  busy: string | null;
  onUseSpFruit: (tier: SpFruitTier) => void;
  onUseEquipmentBox: (boxId: string) => void;
  onUseMasteryTome: () => void;
  rareMaps: RareMapInstance[] | null;
  cashItems: MuseunCashItemCounts;
  onUseCashItem: (itemId: MuseunCashItemId) => void;
  cookingFoods: CookingFoodInventory;
  onUseCookingFood: (itemId: CookingFoodId) => void;
}) {
  const router = useRouter();
  const hasSpFruit = SP_FRUIT_TIERS.some(
    (t) => (materials[SP_FRUIT[t].materialId] ?? 0) > 0,
  );
  const hasEquipmentBox = COOP_ALL_EQUIPMENT_BOXES.some(
    (box) => (materials[box.id] ?? 0) > 0,
  );
  const hasMasteryTome = (materials[COOP_MASTERY_TOME_MATERIAL_ID] ?? 0) > 0;
  const hasCashItem = MUSEUN_UTILITY_ITEM_IDS.some(
    (id) => (cashItems[id] ?? 0) > 0,
  );
  const hasCookingFood = Object.values(cookingFoods).some(
    (count) => (count ?? 0) > 0,
  );
  return (
    <div className="space-y-4">
      <CookingFoodSection
        cookingFoods={cookingFoods}
        busy={busy}
        onUse={onUseCookingFood}
      />
      <CashItemSection
        cashItems={cashItems}
        busy={busy}
        onUse={(itemId) => {
          if (itemId === "rename_permit") {
            router.push("/hidden/rename?cashItem=rename_permit");
            return;
          }
          if (itemId === "profile_image_permit") {
            router.push("/settings/profile-image");
            return;
          }
          onUseCashItem(itemId);
        }}
      />
      <SpFruitSection
        materials={materials}
        used={spFruitUsed}
        busy={busy}
        onUse={onUseSpFruit}
      />
      <CoopEquipmentBoxSection
        materials={materials}
        busy={busy}
        onUse={onUseEquipmentBox}
      />
      <MasteryTomeSection
        materials={materials}
        busy={busy}
        onUse={onUseMasteryTome}
      />
      <ConsumableList
        maps={rareMaps}
        suppressEmpty={
          hasCookingFood ||
          hasCashItem ||
          hasSpFruit ||
          hasEquipmentBox ||
          hasMasteryTome
        }
        onUse={(m) => {
          // 경험치의 비약(테스트) — 화면 이동 없이 즉시 EXP 지급 후 새로고침
          //   (레벨·스탯이 전역에 반영되도록).
          if (m.kind === "exp_tome") {
            fetch("/api/v2/me/use-exp-tome", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ map: m.iid }),
            })
              .then((res) => {
                if (res.ok) window.location.reload();
              })
              .catch(() => {});
            return;
          }
        }}
      />
    </div>
  );
}

function CookingFoodSection({
  cookingFoods,
  busy,
  onUse,
}: {
  cookingFoods: CookingFoodInventory;
  busy: string | null;
  onUse: (itemId: CookingFoodId) => void;
}) {
  const foods = Object.entries(cookingFoods)
    .flatMap(([itemId, count]) => {
      const food = cookingFoodDefinition(itemId);
      return food && (count ?? 0) > 0 ? [{ food, count: count ?? 0 }] : [];
    })
    .sort(
      (a, b) =>
        b.food.recipe.requiredLevel - a.food.recipe.requiredLevel ||
        a.food.name.localeCompare(b.food.name, "ko"),
    );
  if (foods.length === 0) return null;

  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
        음식 · 거래 가능 · 사용 시 PvE 능력치 효과
      </div>
      <ul className="space-y-1.5">
        {foods.map(({ food, count }) => {
          const isBusy = busy === `cooking_food_${food.id}`;
          return (
            <li key={food.id} className={`${SURFACE_CARD} px-3 py-2`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    <Image
                      src={food.recipe.imageSrc}
                      alt=""
                      width={40}
                      height={40}
                      unoptimized
                      className="h-10 w-10 shrink-0 object-contain"
                    />
                    <span className="truncate">{food.name}</span>
                    <span className="shrink-0 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                      ×{count}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {cookingStatText(food.statPct)} · {formatFoodDuration(food.durationMs)}
                  </div>
                </div>
                <Button
                  disabled={isBusy}
                  onClick={() => onUse(food.id)}
                  variant="warning"
                  size="xs"
                  className="shrink-0"
                >
                  {isBusy ? "사용 중…" : "사용"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function formatFoodDuration(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}시간 ${remainder}분` : `${hours}시간`;
}

function CashItemSection({
  cashItems,
  busy,
  onUse,
}: {
  cashItems: MuseunCashItemCounts;
  busy: string | null;
  onUse: (itemId: MuseunCashItemId) => void;
}) {
  const [infoCard, setInfoCard] = useState<{
    itemId: MuseunCashItemId;
    anchor: ItemCardAnchor;
  } | null>(null);
  const heldItems = MUSEUN_UTILITY_ITEM_IDS.filter(
    (itemId) => (cashItems[itemId] ?? 0) > 0,
  );
  if (heldItems.length === 0) return null;

  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
        캐시 아이템
      </div>
      <ul className="space-y-1.5">
        {heldItems.map((itemId) => {
          const item = MUSEUN_CASH_ITEMS[itemId];
          const held = cashItems[itemId] ?? 0;
          const isBusy = busy === `cash_${itemId}`;
          return (
            <li key={itemId} className={`${SURFACE_CARD} px-3 py-2`}>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={(event) =>
                    setInfoCard({
                      itemId,
                      anchor: anchorOf(event.currentTarget),
                    })
                  }
                  className="min-w-0 text-left focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                    <InventoryItemIcon
                      itemId={itemId}
                      size={18}
                      className="shrink-0"
                    />
                    <span className="truncate">{item.name}</span>
                    <span className="shrink-0 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                      ×{held}
                    </span>
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {cashItemUseLabel(itemId)}
                  </span>
                </button>
                <Button
                  disabled={isBusy}
                  onClick={() => onUse(itemId)}
                  variant="warning"
                  size="xs"
                  className="shrink-0"
                >
                  {isBusy ? "사용 중…" : "사용"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {infoCard ? (
        (() => {
          const item = MUSEUN_CASH_ITEMS[infoCard.itemId];
          return (
            <V2SimpleItemInfoCard
              title={item.name}
              subtitle={
                item.tradeable
                  ? "거래 가능한 캐시 소모품"
                  : "계정 귀속 캐시 소모품"
              }
              description={item.description}
              anchor={infoCard.anchor}
              onClose={() => setInfoCard(null)}
              lines={[
                {
                  label: "보유",
                  value: `×${cashItems[infoCard.itemId] ?? 0}`,
                },
                {
                  label: "거래",
                  value: item.tradeable
                    ? "거래소 등록 가능"
                    : "계정 귀속 · 거래 불가",
                },
              ]}
            />
          );
        })()
      ) : null}
    </div>
  );
}

// 상급 숙련 교본 — 협동 보스 주화 상점/거래소로 유통되는 현재 직업 숙련도 보조 소모품.
function MasteryTomeSection({
  materials,
  busy,
  onUse,
}: {
  materials: Partial<Record<V2MaterialId, number>>;
  busy: string | null;
  onUse: () => void;
}) {
  const [infoCard, setInfoCard] = useState<{
    title: string;
    description: string;
    held: number;
    anchor: ItemCardAnchor;
  } | null>(null);
  const held = materials[COOP_MASTERY_TOME_MATERIAL_ID] ?? 0;
  if (held <= 0) return null;

  const material = V2_MATERIALS[COOP_MASTERY_TOME_MATERIAL_ID];
  const isBusy = busy === "coop_mastery_tome";
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold text-violet-700 dark:text-violet-400">
        숙련 교본 · 사용 시 현재 직업 숙련도 증가
      </div>
      <div className="rounded-md border border-violet-200 bg-violet-50 px-3 py-2 dark:border-violet-900 dark:bg-violet-950/40">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={(e) =>
              setInfoCard({
                title: material?.name ?? "상급 숙련 교본",
                description:
                  material?.description ??
                  `사용하면 현재 직업 숙련도가 ${COOP_MASTERY_TOME_GAIN} 오릅니다.`,
                held,
                anchor: anchorOf(e.currentTarget),
              })
            }
            className="min-w-0 text-left focus:outline-none focus:ring-2 focus:ring-violet-400"
          >
            <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
              <InventoryItemIcon
                itemId={COOP_MASTERY_TOME_MATERIAL_ID}
                size={18}
                className="shrink-0"
              />
              <span className="truncate">{material?.name ?? "상급 숙련 교본"}</span>
              <span className="shrink-0 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                ×{held}
              </span>
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              현재 직업 숙련도 +{COOP_MASTERY_TOME_GAIN}
            </span>
          </button>
          <Button
            disabled={isBusy}
            onClick={onUse}
            variant="secondary"
            size="xs"
            className="shrink-0"
          >
            {isBusy ? "사용 중…" : "사용"}
          </Button>
        </div>
      </div>
      {infoCard ? (
        <V2SimpleItemInfoCard
          title={infoCard.title}
          subtitle="소모품"
          description={infoCard.description}
          anchor={infoCard.anchor}
          onClose={() => setInfoCard(null)}
          lines={[
            { label: "보유", value: `×${infoCard.held}` },
            { label: "숙련도", value: `+${COOP_MASTERY_TOME_GAIN}` },
          ]}
        />
      ) : null}
    </div>
  );
}

// SP 열매 섹션 — 협동 보스 드랍 소모품. 등급별로 보유수 + "사용 N/캡" 표시.
//   사용 버튼: 보유 0 또는 캡 도달 시 비활성(캡 도달분은 거래소 거래만). 1회 = SP 최대치 +1.
function SpFruitSection({
  materials,
  used,
  busy,
  onUse,
}: {
  materials: Partial<Record<V2MaterialId, number>>;
  used: Record<SpFruitTier, number>;
  busy: string | null;
  onUse: (tier: SpFruitTier) => void;
}) {
  const [infoCard, setInfoCard] = useState<{
    title: string;
    description: string;
    held: number;
    usedCount: number;
    useCap: number;
    anchor: ItemCardAnchor;
  } | null>(null);

  // 보유분이 하나도 없으면 섹션 자체를 숨긴다(빈 카드 난립 방지). 캡 도달했어도 보유 0이면 숨김.
  const anyHeld = SP_FRUIT_TIERS.some(
    (t) => (materials[SP_FRUIT[t].materialId] ?? 0) > 0,
  );
  if (!anyHeld) return null;
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
        SP 열매 · 사용 시 SP 최대치 영구 +1
      </div>
      <ul className="space-y-1.5">
        {SP_FRUIT_TIERS.map((t) => {
          const def = SP_FRUIT[t];
          const held = materials[def.materialId] ?? 0;
          if (held <= 0) return null;
          const usedCount = used[t] ?? 0;
          const atCap = usedCount >= def.useCap;
          const isBusy = busy === `sp_fruit_${t}`;
          const material = V2_MATERIALS[def.materialId];
          return (
            <li
              key={def.materialId}
              className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/40"
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={(e) =>
                    setInfoCard({
                      title: material?.name ?? def.name,
                      description:
                        material?.description ??
                        `사용하면 SP 최대치가 영구히 +${def.spPerUse} 오릅니다.`,
                      held,
                      usedCount,
                      useCap: def.useCap,
                      anchor: anchorOf(e.currentTarget),
                    })
                  }
                  className="min-w-0 text-left focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                    <InventoryItemIcon
                      itemId={def.materialId}
                      size={18}
                      className="shrink-0"
                    />
                    <span className="truncate">{def.name}</span>
                    <span className="shrink-0 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                      ×{held}
                    </span>
                  </span>
                </button>
                <Button
                  disabled={atCap || isBusy}
                  onClick={() => onUse(t)}
                  variant="warning"
                  size="xs"
                  className="shrink-0"
                >
                  {atCap ? "한도 도달" : isBusy ? "사용 중…" : "사용"}
                </Button>
              </div>
              <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                사용 {usedCount}/{def.useCap}
                {atCap
                  ? " · 한도 도달 (보유·거래만 가능)"
                  : ` · SP 최대치 +${def.spPerUse}/회`}
              </div>
            </li>
          );
        })}
      </ul>
      {infoCard ? (
        <V2SimpleItemInfoCard
          title={infoCard.title}
          subtitle="소모품"
          description={infoCard.description}
          anchor={infoCard.anchor}
          onClose={() => setInfoCard(null)}
          lines={[
            { label: "보유", value: `×${infoCard.held}` },
            { label: "사용", value: `${infoCard.usedCount}/${infoCard.useCap}` },
          ]}
        />
      ) : null}
    </div>
  );
}

// 협동 보스 장비 상자 — 사용 시 해당 보스 단계의 정규 장비 1개 획득.
function CoopEquipmentBoxSection({
  materials,
  busy,
  onUse,
}: {
  materials: Partial<Record<V2MaterialId, number>>;
  busy: string | null;
  onUse: (boxId: string) => void;
}) {
  const [infoCard, setInfoCard] = useState<{
    title: string;
    description: string;
    held: number;
    tier: number;
    source: string;
    anchor: ItemCardAnchor;
  } | null>(null);

  const boxes = COOP_ALL_EQUIPMENT_BOXES
    .map((box) => ({ box, held: materials[box.id] ?? 0 }))
    .filter((entry) => entry.held > 0);
  if (boxes.length === 0) return null;

  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold text-sky-700 dark:text-sky-400">
        협동 장비 상자 · 사용 시 장비 1개 획득
      </div>
      <ul className="space-y-1.5">
        {boxes.map(({ box, held }) => {
          const material = V2_MATERIALS[box.id];
          const isBusy = busy === box.id;
          return (
            <li
              key={box.id}
              className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 dark:border-sky-900 dark:bg-sky-950/40"
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={(e) =>
                    setInfoCard({
                      title: material?.name ?? box.name,
                      description: material?.description ?? box.description,
                      held,
                      tier: box.displayTier,
                      source: box.source,
                      anchor: anchorOf(e.currentTarget),
                    })
                  }
                  className="min-w-0 text-left focus:outline-none focus:ring-2 focus:ring-sky-400"
                >
                  <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                    <InventoryItemIcon
                      itemId={box.id}
                      size={18}
                      className="shrink-0"
                    />
                    <span className="truncate">{box.name}</span>
                    <span className="shrink-0 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                      ×{held}
                    </span>
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {box.displayTier}티어 · {box.source}
                  </span>
                </button>
                <Button
                  disabled={isBusy}
                  onClick={() => onUse(box.id)}
                  variant="secondary"
                  size="xs"
                  className="shrink-0"
                >
                  {isBusy ? "사용 중…" : "사용"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {infoCard ? (
        <V2SimpleItemInfoCard
          title={infoCard.title}
          subtitle="소모품"
          description={infoCard.description}
          anchor={infoCard.anchor}
          onClose={() => setInfoCard(null)}
          lines={[
            { label: "보유", value: `×${infoCard.held}` },
            { label: "티어", value: `${infoCard.tier}티어` },
            { label: "범위", value: infoCard.source },
          ]}
        />
      ) : null}
    </div>
  );
}

// 소모품 탭 — 테스트용 utility 항목만 표시. hunt/location 레어맵은 사냥터 목록에서 입장.
function ConsumableList({
  maps,
  onUse,
  // 위에 다른 소모품 섹션이 이미 보유분을 그리면(true) 빈 안내문을 숨긴다.
  suppressEmpty = false,
}: {
  maps: RareMapInstance[] | null;
  onUse?: (m: RareMapInstance) => void;
  suppressEmpty?: boolean;
}) {
  const utilityMaps = maps?.filter(
    (m) => RARE_MAP_KINDS[m.kind]?.category === "utility",
  );
  const [infoCard, setInfoCard] = useState<{
    title: string;
    subtitle: string;
    description: string;
    lines: { label: string; value: string }[];
    anchor: ItemCardAnchor;
  } | null>(null);

  if (utilityMaps === undefined) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }
  if (utilityMaps.length === 0) {
    if (suppressEmpty) return null;
    return (
      <EmptyState
        icon={<Diamond size={40} weight="duotone" />}
        title="보유한 소모품이 없습니다"
        message="사용할 수 있는 소모품을 획득하면 여기에 표시됩니다."
      />
    );
  }
  return (
    <>
      <ul className="space-y-1.5">
        {utilityMaps.map((m) => {
          const def = RARE_MAP_KINDS[m.kind];
          const lines = [
            { label: "남은 횟수", value: `${m.runsLeft}` },
          ];
          return (
            <li
              key={m.iid}
              className={`${SURFACE_CARD} px-3 py-2`}
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={(e) =>
                    setInfoCard({
                      title: def?.name ?? m.kind,
                      subtitle: "소모품",
                      description: def?.desc ?? "",
                      lines,
                      anchor: anchorOf(e.currentTarget),
                    })
                  }
                  className="min-w-0 text-left focus:outline-none focus:ring-2 focus:ring-sky-400"
                >
                  <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                    <InventoryItemIcon
                      itemId={m.kind}
                      size={18}
                      className="shrink-0"
                    />
                    <span className="truncate">{def?.name ?? m.kind}</span>
                  </span>
                </button>
                <Button
                  onClick={() => onUse?.(m)}
                  variant="info"
                  size="xs"
                  className="shrink-0"
                >
                  사용
                </Button>
              </div>
              <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                남은 {m.runsLeft}회
              </div>
              {def?.desc && (
                <button
                  type="button"
                  onClick={(e) =>
                    setInfoCard({
                      title: def.name,
                      subtitle: "소모품",
                      description: def.desc,
                      lines,
                      anchor: anchorOf(e.currentTarget),
                    })
                  }
                  className="mt-1 line-clamp-2 text-left text-[11px] text-zinc-400 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:text-zinc-500"
                >
                  {def.desc}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {infoCard ? (
        <V2SimpleItemInfoCard
          title={infoCard.title}
          subtitle={infoCard.subtitle}
          description={infoCard.description}
          anchor={infoCard.anchor}
          onClose={() => setInfoCard(null)}
          lines={infoCard.lines}
        />
      ) : null}
    </>
  );
}
