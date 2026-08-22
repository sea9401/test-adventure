"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";
import {
  DANGEROUS_BAITS,
  DANGEROUS_FISH,
  DANGEROUS_FISHING_MATERIALS,
  DANGEROUS_LINES,
  DANGEROUS_REELS,
  DANGEROUS_RODS,
  dangerousCatchMaterialId,
  type DangerousFishRarity,
  type DangerousGearKind,
} from "@/adventure/data/v2/dangerousFishing";
import { materialSellPriceOf } from "@/adventure/data/v2/dungeonDrops";
import { selectCatchMaterials } from "./dangerousFishingExchange";
import type {
  DangerousFishingExchangeEntryView,
  DangerousFishingCatchSaleResult,
  DangerousFishingEnhanceRequest,
  DangerousFishingEnhancementCost,
  DangerousFishingEnhancementItemView,
  DangerousFishingExchangeRequest,
  DangerousFishingExchangeResult,
  DangerousFishingExchangeViewModel,
} from "./useDangerousFishingExchange";

export type DangerousFishingExchangePending =
  DangerousFishingExchangeRequest & {
    entryName: string;
    costMaterials: Record<string, number>;
    materialBalances: Record<string, number>;
    coinCost: number;
    fishingCoins: number;
    outputLabel: string;
  };

export type DangerousFishingExchangeAction = (
  request: DangerousFishingExchangeRequest,
) => Promise<DangerousFishingExchangeResult>;

export type DangerousFishingEnhanceAction = (
  request: DangerousFishingEnhanceRequest,
) => Promise<DangerousFishingExchangeResult>;

type DangerousFishingEnhancementPending = {
  operationId: string | null;
  gearKind: DangerousGearKind;
  gearId: string;
  gearName: string;
  level: number;
  nextLevel: 1 | 2 | 3;
  cost: DangerousFishingEnhancementCost;
};

export type DangerousFishingCatchSalePending = {
  materialId: string;
  name: string;
  amount: number;
  owned: number;
  unitPrice: number;
};

export type DangerousFishingCatchSaleAction = (
  materialId: string,
  amount: number,
) => Promise<DangerousFishingCatchSaleResult>;

export type DangerousFishingExchangeSectionProps = {
  model: DangerousFishingExchangeViewModel | null;
  loading: boolean;
  error?: string | null;
  exchanging: string | null;
  sellingCatch?: string | null;
  onRefresh: () => Promise<boolean>;
  onExchange: DangerousFishingExchangeAction;
  onEnhanceGear?: DangerousFishingEnhanceAction;
  onSellCatch?: DangerousFishingCatchSaleAction;
};

const RARITY_LABELS = {
  common: "일반",
  rare: "희귀",
  epic: "영웅",
  legendary: "전설",
} as const;

function enhancementGearName(kind: DangerousGearKind, gearId: string): string {
  if (kind === "rod") {
    return DANGEROUS_RODS[gearId as keyof typeof DANGEROUS_RODS]?.name ?? gearId;
  }
  if (kind === "reel") {
    return DANGEROUS_REELS[gearId as keyof typeof DANGEROUS_REELS]?.name ?? gearId;
  }
  return DANGEROUS_LINES[gearId as keyof typeof DANGEROUS_LINES]?.name ?? gearId;
}

function enhancementEffectCopy(kind: DangerousGearKind, level: number): string {
  if (kind === "rod") return `어체력 피해 +${level * 6}%`;
  if (kind === "reel") return `거리 회수량 +${level * 5}%`;
  return `안전 구간 폭 +${level * 3}%p · 화물 보호 +${level * 2}%p`;
}

function enhancementCostCopy(cost: {
  materials: Partial<Record<DangerousFishRarity, number>>;
  fishingCoins: number;
}): string[] {
  return [
    ...(Object.entries(cost.materials) as [DangerousFishRarity, number][]).map(
      ([rarity, count]) => `${RARITY_LABELS[rarity]} 어획물 ${count}개`,
    ),
    `낚시 코인 ${cost.fishingCoins.toLocaleString()}`,
  ];
}

function outputLabel(
  entry: DangerousFishingExchangeEntryView,
  batches: number,
): string {
  const output = entry.output;
  if (output.kind === "bait") {
    return `${DANGEROUS_BAITS[output.baitId].name} ${output.count * batches}개`;
  }
  if (output.kind === "gear") {
    const item =
      output.gearKind === "rod"
        ? DANGEROUS_RODS[output.gearId as keyof typeof DANGEROUS_RODS]
        : output.gearKind === "reel"
          ? DANGEROUS_REELS[output.gearId as keyof typeof DANGEROUS_REELS]
          : DANGEROUS_LINES[output.gearId as keyof typeof DANGEROUS_LINES];
    return item?.name ?? entry.name;
  }
  if (output.kind === "title") return `칭호 · ${entry.name}`;
  return `영구 프로필 테두리 · ${entry.name}`;
}

function materialName(materialId: string): string {
  return DANGEROUS_FISHING_MATERIALS[materialId]?.name ?? materialId;
}

function costLabel(entry: DangerousFishingExchangeEntryView): string {
  if (entry.cost.kind === "catch") {
    return `${RARITY_LABELS[entry.cost.rarity]} 어획물 ${entry.cost.count}개`;
  }
  const parts = Object.entries(entry.cost.materials).map(
    ([materialId, count]) => `${materialName(materialId)} ${count}개`,
  );
  if (entry.cost.fishingCoins > 0) {
    parts.push(`낚시 코인 ${entry.cost.fishingCoins.toLocaleString()}`);
  }
  return parts.join(" + ");
}

function makePending(
  model: DangerousFishingExchangeViewModel,
  entry: DangerousFishingExchangeEntryView,
  batches: number,
): DangerousFishingExchangePending | null {
  const selected =
    entry.cost.kind === "catch"
      ? selectCatchMaterials(
          entry.cost.rarity,
          model.materials,
          entry.cost.count * batches,
        )
      : Object.fromEntries(
          Object.entries(entry.cost.materials).map(([materialId, count]) => [
            materialId,
            count * batches,
          ]),
        );
  if (Object.keys(selected).length === 0) return null;
  return {
    operationId: crypto.randomUUID(),
    entryId: entry.id,
    entryName: entry.name,
    batches,
    ...(entry.cost.kind === "catch" ? { selectedMaterials: selected } : {}),
    costMaterials: selected,
    materialBalances: model.materials,
    coinCost:
      entry.cost.kind === "materials"
        ? entry.cost.fishingCoins * batches
        : 0,
    fishingCoins: model.fishingCoins,
    outputLabel: outputLabel(entry, batches),
  };
}

function EntryCard({
  entry,
  disabled,
  onChoose,
}: {
  entry: DangerousFishingExchangeEntryView;
  disabled: boolean;
  onChoose: (batches: number) => void;
}) {
  const unavailable = entry.maxBatches < 1 || entry.alreadyOwned;
  return (
    <article className={`${SURFACE_INSET} space-y-2 p-3`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h4 className="text-sm font-semibold">{entry.name}</h4>
            {entry.alreadyOwned ? (
              <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-200">
                보유 중
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {entry.description}
          </p>
        </div>
        <span className="shrink-0 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
          교환 가능 {entry.maxBatches}회
        </span>
      </div>
      <div className="grid gap-1 text-xs sm:grid-cols-2">
        <p><span className="text-zinc-500 dark:text-zinc-400">소모</span> · {costLabel(entry)}</p>
        <p><span className="text-zinc-500 dark:text-zinc-400">지급</span> · {outputLabel(entry, 1)}</p>
      </div>
      <div className="flex justify-end gap-2">
        <Button
          size="xs"
          variant="success"
          disabled={disabled || unavailable}
          onClick={() => onChoose(1)}
        >
          {entry.alreadyOwned ? "보유 중" : "1회 교환"}
        </Button>
        {entry.repeatable && entry.maxBatches > 1 ? (
          <Button
            size="xs"
            variant="warning"
            disabled={disabled}
            onClick={() => onChoose(entry.maxBatches)}
          >
            최대 {entry.maxBatches}회 교환
          </Button>
        ) : null}
      </div>
    </article>
  );
}

function EnhancementCard({
  item,
  disabled,
  onChoose,
}: {
  item: DangerousFishingEnhancementItemView;
  disabled: boolean;
  onChoose: () => void;
}) {
  const name = enhancementGearName(item.gearKind, item.gearId);
  const next = item.nextEnhancement;
  return (
    <article className={`${SURFACE_INSET} space-y-2 p-3`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold">{name} +{item.level}</h4>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
            현재 · {enhancementEffectCopy(item.gearKind, item.level)}
          </p>
        </div>
        <span className="shrink-0 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-200">
          +{item.level}
        </span>
      </div>
      {next ? (
        <>
          <div className="space-y-1 text-xs">
            <p><span className="text-zinc-500 dark:text-zinc-400">다음 +{next.level}</span> · {enhancementEffectCopy(item.gearKind, next.level)}</p>
            <p><span className="text-zinc-500 dark:text-zinc-400">비용</span> · {enhancementCostCopy(next.cost).join(" + ")}</p>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className={`text-[11px] font-semibold ${next.affordable ? "text-emerald-700 dark:text-emerald-300" : "text-rose-600 dark:text-rose-400"}`}>
              {next.affordable ? "강화 가능" : "재료 또는 코인 부족"}
            </span>
            <Button
              size="xs"
              variant="warning"
              aria-label={`${name} +${next.level} 강화`}
              disabled={disabled || !next.affordable}
              onClick={onChoose}
            >
              +{next.level} 강화
            </Button>
          </div>
        </>
      ) : (
        <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
          최대 강화 완료 · 영구 +3
        </p>
      )}
    </article>
  );
}

function CatchSaleCard({
  materialId,
  name,
  owned,
  unitPrice,
  disabled,
  onChoose,
}: DangerousFishingCatchSalePending & {
  disabled: boolean;
  onChoose: (amount: number) => void;
}) {
  const [amountText, setAmountText] = useState("1");
  const amount = Number(amountText);
  const valid = Number.isInteger(amount) && amount > 0 && amount <= owned;
  const inputId = `dangerous-catch-sale-${materialId}`;
  return (
    <article className={`${SURFACE_INSET} space-y-2 p-3`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold">{name}</h4>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            보유 {owned}개 · 개당 {unitPrice.toLocaleString()} G
          </p>
        </div>
        <p className="shrink-0 text-xs font-semibold text-amber-700 dark:text-amber-300">
          은행 입금
        </p>
      </div>
      <div className="flex items-end justify-end gap-2">
        <label htmlFor={inputId} className="text-xs text-zinc-600 dark:text-zinc-300">
          판매 수량
          <input
            id={inputId}
            aria-label={`${name} 판매 수량`}
            className="mt-1 block w-24 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-right text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-950"
            type="number"
            inputMode="numeric"
            min={1}
            max={owned}
            step={1}
            value={amountText}
            disabled={disabled}
            onChange={(event) => setAmountText(event.target.value)}
          />
        </label>
        <Button
          size="xs"
          variant="warning"
          aria-label={`${name} NPC 판매`}
          disabled={disabled || !valid}
          onClick={() => onChoose(amount)}
        >
          판매 확인
        </Button>
      </div>
    </article>
  );
}

export function DangerousFishingExchangeConfirmDialog({
  pending,
  exchanging,
  onConfirm,
  onClose,
}: {
  pending: DangerousFishingExchangePending;
  exchanging: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEscapeKey(onClose);
  useModalA11y(panelRef);
  return (
    <div
      className="ui-modal-reveal fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !exchanging) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dangerous-exchange-confirm-title"
        className={`${SURFACE_CARD} ui-modal-panel w-full max-w-md p-5 shadow-2xl`}
      >
        <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">위험 해역 교환 확인</p>
        <h2 id="dangerous-exchange-confirm-title" className="mt-1 text-lg font-bold">
          {pending.entryName} {pending.batches}회
        </h2>
        <div className={`${SURFACE_INSET} mt-4 space-y-2 p-3 text-sm`}>
          {Object.entries(pending.costMaterials).map(
            ([materialId, count]) => (
              <div key={materialId} className="flex items-center justify-between gap-3">
                <span>{materialName(materialId)} {count}개</span>
                <span className="text-zinc-500 dark:text-zinc-400">
                  교환 후 {(pending.materialBalances[materialId] ?? 0) - count}개
                </span>
              </div>
            ),
          )}
          {pending.coinCost > 0 ? (
            <div className="flex items-center justify-between gap-3">
              <span>낚시 코인 {pending.coinCost.toLocaleString()}</span>
              <span className="text-zinc-500 dark:text-zinc-400">
                교환 후 {(pending.fishingCoins - pending.coinCost).toLocaleString()}
              </span>
            </div>
          ) : null}
        </div>
        <p className="mt-3 text-sm">
          <span className="text-zinc-500 dark:text-zinc-400">받는 보상</span> · <strong>{pending.outputLabel}</strong>
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button size="md" disabled={exchanging} onClick={onClose}>취소</Button>
          <Button size="md" variant="warning" disabled={exchanging} onClick={onConfirm}>
            {exchanging ? "교환 중…" : `${pending.batches}회 교환`}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DangerousFishingCatchSaleConfirmDialog({
  pending,
  selling,
  onConfirm,
  onClose,
}: {
  pending: DangerousFishingCatchSalePending;
  selling: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEscapeKey(() => {
    if (!selling) onClose();
  });
  useModalA11y(panelRef);
  const total = pending.amount * pending.unitPrice;
  return (
    <div
      className="ui-modal-reveal fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !selling) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dangerous-catch-sale-confirm-title"
        className={`${SURFACE_CARD} ui-modal-panel w-full max-w-md p-5 shadow-2xl`}
      >
        <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
          어획물 NPC 판매 확인
        </p>
        <h2 id="dangerous-catch-sale-confirm-title" className="mt-1 text-lg font-bold">
          {pending.name} {pending.amount}개
        </h2>
        <div className={`${SURFACE_INSET} mt-4 space-y-2 p-3 text-sm`}>
          <div className="flex items-center justify-between gap-3">
            <span>보유 {pending.owned}개</span>
            <span>판매 후 {pending.owned - pending.amount}개</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>개당 {pending.unitPrice.toLocaleString()} G</span>
            <strong>총 {total.toLocaleString()} G</strong>
          </div>
        </div>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
          판매 대금은 소지금이 아니라 은행에 입금됩니다. 이 어획물은 거래소에서도 판매할 수 있습니다.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button size="md" disabled={selling} onClick={onClose}>취소</Button>
          <Button
            size="md"
            variant="warning"
            disabled={selling}
            loading={selling}
            loadingLabel={`${pending.amount}개 판매 처리 중`}
            aria-label={`${pending.amount}개 판매 확정`}
            onClick={onConfirm}
          >
            {pending.amount}개 판매 확정
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DangerousFishingEnhanceConfirmDialog({
  pending,
  enhancing,
  onConfirm,
  onClose,
}: {
  pending: DangerousFishingEnhancementPending;
  enhancing: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeIfIdle = () => {
    if (!enhancing) onClose();
  };
  useEscapeKey(closeIfIdle);
  useModalA11y(panelRef);
  return (
    <div
      className="ui-modal-reveal fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) closeIfIdle();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dangerous-enhance-confirm-title"
        className={`${SURFACE_CARD} ui-modal-panel w-full max-w-md p-5 shadow-2xl`}
      >
        <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
          위험 해역 장비 영구 강화
        </p>
        <h2 id="dangerous-enhance-confirm-title" className="mt-1 text-lg font-bold">
          {pending.gearName} 강화 확인
        </h2>
        <p className="mt-2 text-sm font-semibold">
          +{pending.level} → +{pending.nextLevel} · {enhancementEffectCopy(pending.gearKind, pending.nextLevel)}
        </p>
        <div className={`${SURFACE_INSET} mt-4 space-y-2 p-3 text-sm`}>
          {enhancementCostCopy(pending.cost).map((label) => (
            <p key={label}>{label}</p>
          ))}
        </div>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
          강화는 영구 적용되며 100% 성공합니다. 장비 파괴·하락·초기화 없음.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button size="md" disabled={enhancing} onClick={onClose}>취소</Button>
          <Button
            size="md"
            variant="warning"
            disabled={enhancing}
            loading={enhancing}
            loadingLabel={`+${pending.nextLevel} 강화 처리 중`}
            aria-label={pending.operationId ? `+${pending.nextLevel} 강화 다시 시도` : `+${pending.nextLevel} 강화 확정`}
            onClick={onConfirm}
          >
            {pending.operationId ? `+${pending.nextLevel} 다시 강화` : `+${pending.nextLevel} 강화 확정`}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DangerousFishingExchangeSection({
  model,
  loading,
  error,
  exchanging,
  sellingCatch = null,
  onRefresh,
  onExchange,
  onEnhanceGear,
  onSellCatch,
}: DangerousFishingExchangeSectionProps) {
  const [pending, setPending] =
    useState<DangerousFishingExchangePending | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingSale, setPendingSale] =
    useState<DangerousFishingCatchSalePending | null>(null);
  const [pendingEnhancement, setPendingEnhancement] =
    useState<DangerousFishingEnhancementPending | null>(null);
  const [confirmingEnhancement, setConfirmingEnhancement] = useState(false);
  const enhancementConfirmationRef = useRef(false);

  if (loading) {
    return <section className={`${SURFACE_CARD} p-4 text-center text-sm text-zinc-500 dark:text-zinc-400`}>교환 목록을 불러오는 중…</section>;
  }
  if (error || !model) {
    return (
      <section className={`${SURFACE_CARD} p-4 text-center`}>
        <p className="text-sm text-rose-600 dark:text-rose-400">{error ?? "교환 목록을 불러오지 못했다."}</p>
        <Button className="mt-3" size="xs" onClick={() => void onRefresh()}>다시 불러오기</Button>
      </section>
    );
  }

  const groups = [
    { label: "어획물 납품", entries: model.entries.filter((entry) => entry.cost.kind === "catch") },
    { label: "증표 장비 교환", entries: model.entries.filter((entry) => entry.output.kind === "gear") },
    { label: "수집 보상", entries: model.entries.filter((entry) => entry.output.kind === "title" || entry.output.kind === "cosmetic") },
    { label: "반복 미끼 교환", entries: model.entries.filter((entry) => entry.cost.kind === "materials" && entry.output.kind === "bait") },
  ];
  const ownedSellableCatches = Object.values(DANGEROUS_FISH).flatMap((fish) => {
    const materialId = dangerousCatchMaterialId(fish.id);
    const owned = Math.max(0, Math.floor(model.materials[materialId] ?? 0));
    const unitPrice = materialSellPriceOf(materialId);
    return owned > 0 && unitPrice != null
      ? [{ materialId, name: fish.name, amount: 1, owned, unitPrice }]
      : [];
  });
  const anyInFlight = exchanging !== null || sellingCatch !== null;
  const choose = (entry: DangerousFishingExchangeEntryView, batches: number) => {
    const next = makePending(model, entry, batches);
    if (next) setPending(next);
  };
  const confirm = async () => {
    if (!pending) return;
    const result = await onExchange({
      operationId: pending.operationId,
      entryId: pending.entryId,
      batches: pending.batches,
      ...(pending.selectedMaterials
        ? { selectedMaterials: pending.selectedMaterials }
        : {}),
    });
    setMessage(result.message);
    if (result.ok) setPending(null);
  };
  const confirmSale = async () => {
    if (!pendingSale || !onSellCatch) return;
    const result = await onSellCatch(pendingSale.materialId, pendingSale.amount);
    setMessage(result.message);
    if (result.ok) setPendingSale(null);
  };
  const chooseEnhancement = (item: DangerousFishingEnhancementItemView) => {
    if (!item.nextEnhancement) return;
    setPendingEnhancement({
      operationId: null,
      gearKind: item.gearKind,
      gearId: item.gearId,
      gearName: enhancementGearName(item.gearKind, item.gearId),
      level: item.level,
      nextLevel: item.nextEnhancement.level,
      cost: item.nextEnhancement.cost,
    });
  };
  const confirmEnhancement = async () => {
    if (!pendingEnhancement || !onEnhanceGear || enhancementConfirmationRef.current) return;
    enhancementConfirmationRef.current = true;
    setConfirmingEnhancement(true);
    const operationId = pendingEnhancement.operationId ?? crypto.randomUUID();
    if (!pendingEnhancement.operationId) {
      setPendingEnhancement((current) =>
        current ? { ...current, operationId } : current,
      );
    }
    try {
      const result = await onEnhanceGear({
        operationId,
        gearKind: pendingEnhancement.gearKind,
        gearId: pendingEnhancement.gearId,
        expectedCurrentLevel: pendingEnhancement.level,
        expectedNextLevel: pendingEnhancement.nextLevel,
      });
      setMessage(result.message);
      if (result.ok) setPendingEnhancement(null);
    } finally {
      enhancementConfirmationRef.current = false;
      setConfirmingEnhancement(false);
    }
  };

  return (
    <section className={`${SURFACE_CARD} space-y-4 p-4`}>
      <div>
        <h2 className="font-bold">위험 해역 교환</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          안전 귀환한 어획물과 거대어 증표를 특수 미끼, 장비, 한정 보상으로 교환합니다. 재료는 거래소에서도 계속 거래할 수 있습니다.
        </p>
      </div>
      {message ? <p className="text-sm text-zinc-700 dark:text-zinc-200">{message}</p> : null}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
          전용 장비 영구 강화
        </h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          보유 장비를 최대 +3까지 확정 강화합니다. 모든 단계는 영구 보존되며 주기적으로 초기화되지 않습니다.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {model.enhancementItems.map((item) => (
            <EnhancementCard
              key={`${item.gearKind}:${item.gearId}`}
              item={item}
              disabled={anyInFlight || !onEnhanceGear}
              onChoose={() => chooseEnhancement(item)}
            />
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
          어획물 NPC 판매
        </h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          원하는 수량만 즉시 환금할 수 있습니다. 대금은 은행에 입금되며 거래소 판매도 계속 이용할 수 있습니다.
        </p>
        {ownedSellableCatches.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {ownedSellableCatches.map((sale) => (
              <CatchSaleCard
                key={sale.materialId}
                {...sale}
                disabled={anyInFlight || !onSellCatch}
                onChoose={(amount) => setPendingSale({ ...sale, amount })}
              />
            ))}
          </div>
        ) : (
          <p className={`${SURFACE_INSET} p-3 text-xs text-zinc-500 dark:text-zinc-400`}>
            판매할 수 있는 귀환 어획물이 없습니다.
          </p>
        )}
      </div>
      {groups.map((group) => (
        <div key={group.label} className="space-y-2">
          <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{group.label}</h3>
          <div className="grid gap-2">
            {group.entries.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                disabled={anyInFlight}
                onChoose={(batches) => choose(entry, batches)}
              />
            ))}
          </div>
        </div>
      ))}
      {pending ? (
        <DangerousFishingExchangeConfirmDialog
          pending={pending}
          exchanging={exchanging === pending.entryId}
          onConfirm={() => void confirm()}
          onClose={() => setPending(null)}
        />
      ) : null}
      {pendingSale ? (
        <DangerousFishingCatchSaleConfirmDialog
          pending={pendingSale}
          selling={sellingCatch === pendingSale.materialId}
          onConfirm={() => void confirmSale()}
          onClose={() => setPendingSale(null)}
        />
      ) : null}
      {pendingEnhancement ? (
        <DangerousFishingEnhanceConfirmDialog
          pending={pendingEnhancement}
          enhancing={
            confirmingEnhancement ||
            exchanging === `enhance:${pendingEnhancement.gearKind}:${pendingEnhancement.gearId}`
          }
          onConfirm={() => void confirmEnhancement()}
          onClose={() => setPendingEnhancement(null)}
        />
      ) : null}
    </section>
  );
}
