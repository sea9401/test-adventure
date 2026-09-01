"use client";

import { useMemo, useRef, useState } from "react";
import { Lock, Question, Sparkle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { ItemTypeChip } from "@/components/ui/ItemTypeChip";
import { StatusBanner } from "@/components/ui/StatusBanner";
import {
  SURFACE_ACCENT,
  SURFACE_CARD,
  SURFACE_INSET,
} from "@/components/ui/surfaces";
import {
  EQUIPMENT_LIBERATION_GOLD_COST,
  type LiberationRank,
} from "@/adventure/data/v2/equipmentLiberation";
import {
  V2_EQUIPMENT,
  equipmentPowerDisplayValue,
  type V2EquipInstance,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import {
  EquipmentTierBadge,
  EnhanceLevelBadge,
  QualityPctText,
  UniqueBadge,
  powerNameClass,
} from "@/adventure/v2/V2ItemCard";
import {
  EquipmentEnchantmentGuideDialog,
  InitialEnchantmentConfirmDialog,
} from "./EquipmentEnchantmentDialogs";
import { EquipmentEnchantmentPickerDialog } from "./EquipmentEnchantmentPickerDialog";
import {
  enchantmentStage,
  formatLiberationOptionRoll,
  liberationCandidateRows,
  liberationOptionProbabilityRows,
} from "./equipmentLiberationViewModel";

type LiberationApiResponse = {
  ok?: boolean;
  error?: string;
  item?: V2EquipInstance;
  gold?: number;
  bankedGold?: number;
};

type PendingRequest = {
  iid: string;
  revision: number;
  requestId: string;
};

export type EquipmentLiberationPanelProps = {
  owned: readonly V2EquipInstance[];
  equipped: Partial<Record<V2EquipSlot, string>>;
  gold: number;
  bankedGold: number;
  initialItemIid?: string;
  onItemUpdated: (item: V2EquipInstance) => void;
  onWalletUpdated: (gold: number, bankedGold: number) => void;
};

function errorMessage(error: string | undefined): string {
  switch (error) {
    case "insufficient_gold":
      return "골드가 부족합니다.";
    case "ineligible":
      return "이 장비에는 마법부여할 수 없습니다.";
    case "not_owned":
      return "보유하지 않은 장비입니다.";
    case "stale_state":
      return "다른 작업에서 장비 상태가 바뀌어 최신 상태를 불러왔습니다.";
    default:
      return "마법부여에 실패했습니다. 잠시 후 다시 시도해 주세요.";
  }
}

export function EquipmentLiberationPanel({
  owned,
  equipped,
  gold,
  bankedGold,
  initialItemIid,
  onItemUpdated,
  onWalletUpdated,
}: EquipmentLiberationPanelProps) {
  const candidates = useMemo(
    () => liberationCandidateRows(owned, equipped),
    [equipped, owned],
  );
  const [selectedIid, setSelectedIid] = useState(initialItemIid ?? "");
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    tone: "success" | "warning";
    text: string;
  } | null>(null);
  const [result, setResult] = useState<{
    rank: LiberationRank;
    promoted: boolean;
    revision: number;
  } | null>(null);
  const pendingRequest = useRef<PendingRequest | null>(null);
  const selected =
    candidates.find((candidate) => candidate.iid === selectedIid) ??
    candidates[0];
  const instance = selected?.item;
  const item = instance ? V2_EQUIPMENT[instance.id] : undefined;
  const current = instance?.liberation;
  const isReroll = current != null;
  const spendable = gold + bankedGold;
  const probabilityRows = item ? liberationOptionProbabilityRows(item.slot) : [];

  function selectEquipment(iid: string): void {
    if (busy) return;
    setSelectedIid(iid);
    setSelectionOpen(false);
    setMessage(null);
    setResult(null);
  }

  async function submit(): Promise<void> {
    if (!instance || busy) return;
    const revision = current?.revision ?? 0;
    const reusable = pendingRequest.current;
    const request =
      reusable?.iid === instance.iid && reusable.revision === revision
        ? reusable
        : { iid: instance.iid, revision, requestId: crypto.randomUUID() };
    pendingRequest.current = request;
    setBusy(true);
    try {
      const response = await fetch("/api/v2/me/equipment/liberate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          iid: request.iid,
          requestId: request.requestId,
          expectedRevision: request.revision,
        }),
      });
      const body = (await response.json()) as LiberationApiResponse;
      pendingRequest.current = null;
      if (!response.ok || !body.ok || !body.item) {
        if (
          response.status === 409 &&
          body.error === "stale_state" &&
          body.item
        ) {
          onItemUpdated(body.item);
        }
        setMessage({ tone: "warning", text: errorMessage(body.error) });
        return;
      }
      const previousRank = current?.rank ?? 3;
      const nextLiberation = body.item.liberation;
      onItemUpdated(body.item);
      onWalletUpdated(body.gold ?? gold, body.bankedGold ?? bankedGold);
      setResult({
        rank: nextLiberation?.rank ?? previousRank,
        promoted:
          nextLiberation != null && nextLiberation.rank < previousRank,
        revision: nextLiberation?.revision ?? revision + 1,
      });
      setMessage({
        tone: "success",
        text: isReroll
          ? "재마법부여가 완료되었습니다."
          : "장비 마법부여가 완료되었습니다.",
      });
    } catch {
      setMessage({
        tone: "warning",
        text: "연결에 실패했습니다. 다시 시도하면 같은 요청으로 안전하게 이어집니다.",
      });
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  }

  if (candidates.length === 0) {
    return (
      <section className={`${SURFACE_CARD} p-5`}>
        <h2 className="font-semibold">장비 마법부여</h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          마법부여 가능한 6T 이상 장비가 없습니다. 폭풍 개량 장비에는 마법부여할 수 없습니다.
        </p>
      </section>
    );
  }

  return (
    <>
      <section className={`${SURFACE_CARD} p-4 sm:p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold">장비 마법부여 작업대</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              대상 장비를 확인한 뒤 옵션을 부여하세요.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              aria-label="마법부여 도움말"
              aria-haspopup="dialog"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-violet-200 bg-white text-violet-700 shadow-sm transition-colors hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-violet-800 dark:bg-zinc-900 dark:text-violet-300 dark:hover:bg-violet-950"
            >
              <Question size={17} weight="bold" aria-hidden />
            </button>
          </div>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => setSelectionOpen(true)}
          aria-label={`대상 장비 변경 · ${candidates.length}개 선택 가능`}
          className={`${SURFACE_ACCENT} mt-4 flex min-h-16 w-full items-center justify-between gap-3 border-violet-300 px-4 py-3 text-left shadow-sm transition hover:border-violet-500 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-violet-800 dark:hover:border-violet-500`}
        >
          <span>
            <strong className="block text-sm text-violet-950 dark:text-violet-100">
              대상 장비 변경
            </strong>
            <span className="mt-0.5 block text-xs text-zinc-600 dark:text-zinc-300">
              품질·위력·옵션을 비교해 선택
            </span>
          </span>
          <span className="shrink-0 rounded-full border border-violet-300 bg-white px-2.5 py-1 text-xs font-bold text-violet-700 dark:border-violet-700 dark:bg-zinc-950 dark:text-violet-300">
            {candidates.length}개 선택 가능
          </span>
        </button>

        {selected && instance && item ? (
          <section
            aria-labelledby="current-enchantment-target-title"
            className={`${SURFACE_INSET} mt-3 p-3 sm:p-4`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p
                  id="current-enchantment-target-title"
                  className="text-xs font-semibold text-violet-700 dark:text-violet-300"
                >
                  현재 선택 장비
                </p>
                <div className="mt-1 flex min-w-0 items-center gap-1.5">
                  <h3
                    className={`truncate text-base font-bold ${powerNameClass(
                      item,
                      instance.roll,
                      instance.enhance,
                      instance.craftQuality,
                    )}`}
                  >
                    {selected.name}
                  </h3>
                  <ItemTypeChip item={item} />
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                {selected.isEquipped ? (
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    장착 중
                  </span>
                ) : null}
                {instance.locked ? (
                  <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                    <Lock size={11} weight="fill" aria-hidden /> 잠금됨
                  </span>
                ) : null}
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1">
              <EquipmentTierBadge tier={item.tier} compact />
              {item.rarity === "unique" ? <UniqueBadge /> : null}
              <EnhanceLevelBadge enhance={instance.enhance} />
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              <span className="tabular-nums">
                위력 {equipmentPowerDisplayValue(selected.effectivePower)}
              </span>
              {selected.qualityPct != null ? (
                <span className="tabular-nums">
                  품질 <QualityPctText pct={selected.qualityPct} />
                </span>
              ) : (
                <span className="text-zinc-500 dark:text-zinc-400">품질 고정</span>
              )}
            </div>

            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              {current
                ? `마법부여 ${enchantmentStage(current.rank)}단계 · ${current.lineCount}줄`
                : "아직 마법부여되지 않은 장비"}
            </p>
          </section>
        ) : null}

        <div className={`${SURFACE_INSET} mt-4 flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs`}>
          <span className="text-zinc-500 dark:text-zinc-400">
            6T 이상 · 폭풍 개량 제외
          </span>
          <span className="tabular-nums">
            비용 <strong className="text-amber-700 dark:text-amber-300">{EQUIPMENT_LIBERATION_GOLD_COST.toLocaleString()} G</strong>
            <span className="ml-2 text-zinc-500 dark:text-zinc-400">
              결제 가능 {spendable.toLocaleString()} G
            </span>
          </span>
        </div>

        {current ? (
          <div className={`${SURFACE_ACCENT} mt-4 p-3 sm:p-4`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex size-8 items-center justify-center rounded-lg border border-violet-200 bg-white text-violet-600 shadow-sm dark:border-violet-800 dark:bg-zinc-900 dark:text-violet-300">
                  <Sparkle size={18} weight="duotone" aria-hidden />
                </span>
                <div>
                  <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">
                    마법 각인
                  </p>
                  <h3 className="text-sm font-bold">현재 마법부여 옵션</h3>
                </div>
              </div>
              <span className="rounded-full border border-amber-300 bg-white px-2 py-1 text-[11px] font-bold text-amber-700 dark:border-amber-800 dark:bg-zinc-900 dark:text-amber-300">
                {current.lineCount}줄
              </span>
            </div>
            <ul
              key={`enchantment-options-${result?.revision ?? current.revision}`}
              aria-label="현재 마법부여 옵션"
              className={`mt-3 space-y-2 ${result ? "ui-result-highlight" : ""}`}
            >
              {current.options.map((option) => (
                <li
                  key={option.id}
                  className={`${SURFACE_INSET} flex items-center justify-between gap-3 border-violet-200 px-3 py-2.5 shadow-sm dark:border-violet-900`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Sparkle
                      size={15}
                      weight="fill"
                      className="shrink-0 text-violet-500"
                      aria-hidden
                    />
                    <strong className="truncate text-sm text-violet-950 dark:text-violet-100">
                      {formatLiberationOptionRoll(option)}
                    </strong>
                  </span>
                  <span className="shrink-0 rounded-md border border-violet-200 bg-white px-2 py-1 text-xs font-bold tabular-nums text-violet-700 dark:border-violet-800 dark:bg-zinc-900 dark:text-violet-300">
                    Lv.{option.level}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className={`${SURFACE_INSET} mt-4 p-3 text-sm leading-relaxed`}>
            최초 마법부여에서 장비 귀속과 옵션 줄 수가 확정됩니다. 실행 전에 한 번만 자세히 확인합니다.
          </div>
        )}

        {result ? (
          <div className={`${result.promoted ? SURFACE_ACCENT : SURFACE_INSET} mt-4 p-3 text-sm font-semibold`} role="status">
            {result.promoted
              ? `단계 상승! 마법부여 ${enchantmentStage(result.rank)}단계`
              : `마법부여 ${enchantmentStage(result.rank)}단계 결과가 반영되었습니다.`}
          </div>
        ) : null}
        {message ? (
          <div className="mt-4">
            <StatusBanner tone={message.tone}>{message.text}</StatusBanner>
          </div>
        ) : null}

        <Button
          className="mt-4 w-full shadow-lg shadow-violet-500/20"
          size="md"
          variant="primary"
          disabled={busy || spendable < EQUIPMENT_LIBERATION_GOLD_COST}
          onClick={() => {
            if (isReroll) {
              void submit();
            } else {
              setConfirmOpen(true);
            }
          }}
        >
          {busy ? "마법부여 중…" : isReroll ? "재마법부여" : "마법부여"}
        </Button>
      </section>

      {selectionOpen ? (
        <EquipmentEnchantmentPickerDialog
          candidates={candidates}
          selectedIid={selected?.iid ?? ""}
          busy={busy}
          onSelect={selectEquipment}
          onClose={() => setSelectionOpen(false)}
        />
      ) : null}
      {guideOpen ? (
        <EquipmentEnchantmentGuideDialog
          probabilityRows={probabilityRows}
          onClose={() => setGuideOpen(false)}
        />
      ) : null}
      {confirmOpen && instance ? (
        <InitialEnchantmentConfirmDialog
          itemName={selected.name}
          goldCost={EQUIPMENT_LIBERATION_GOLD_COST}
          busy={busy}
          onConfirm={() => void submit()}
          onClose={() => setConfirmOpen(false)}
        />
      ) : null}
    </>
  );
}
