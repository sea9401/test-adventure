"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";
import {
  DANGEROUS_BAITS,
  DANGEROUS_FISHING_MATERIALS,
  DANGEROUS_LINES,
  DANGEROUS_REELS,
  DANGEROUS_RODS,
} from "@/adventure/data/v2/dangerousFishing";
import { selectCatchMaterials } from "./dangerousFishingExchange";
import type {
  DangerousFishingExchangeEntryView,
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

export type DangerousFishingExchangeSectionProps = {
  model: DangerousFishingExchangeViewModel | null;
  loading: boolean;
  error?: string | null;
  exchanging: string | null;
  onRefresh: () => Promise<boolean>;
  onExchange: DangerousFishingExchangeAction;
};

const RARITY_LABELS = {
  common: "일반",
  rare: "희귀",
  epic: "영웅",
  legendary: "전설",
} as const;

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

export function DangerousFishingExchangeSection({
  model,
  loading,
  error,
  exchanging,
  onRefresh,
  onExchange,
}: DangerousFishingExchangeSectionProps) {
  const [pending, setPending] =
    useState<DangerousFishingExchangePending | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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

  return (
    <section className={`${SURFACE_CARD} space-y-4 p-4`}>
      <div>
        <h2 className="font-bold">위험 해역 교환</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          안전 귀환한 어획물과 거대어 증표를 특수 미끼, 장비, 한정 보상으로 교환합니다. 재료는 거래소에서도 계속 거래할 수 있습니다.
        </p>
      </div>
      {message ? <p className="text-sm text-zinc-700 dark:text-zinc-200">{message}</p> : null}
      {groups.map((group) => (
        <div key={group.label} className="space-y-2">
          <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{group.label}</h3>
          <div className="grid gap-2">
            {group.entries.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                disabled={exchanging !== null}
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
    </section>
  );
}
