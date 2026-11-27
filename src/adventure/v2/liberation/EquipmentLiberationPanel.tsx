"use client";

import { useMemo, useRef, useState } from "react";
import {
  CUT_GEMS,
  CUT_GEM_GRADES,
  LIBERATION_LOCK_GOLD_PER_LINE,
  cutGemUsableForRank,
} from "@/adventure/v2/gemCutting";
import { Lock, Question, Sparkle } from "@phosphor-icons/react";
import { equipmentLiberationRevision } from "@/adventure/data/v2/equipmentEnchantmentTransfer";
import { EquipmentEnchantmentTransfer } from "./EquipmentEnchantmentTransfer";
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
import { ENCHANT_SCROLL_ITEM_ID } from "@/adventure/data/v2/museunCashItems";
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
  cashItems?: Record<string, number>;
  /** 남은 세공 보석(재료 id → 개수). */
  cutGems?: Record<string, number>;
};

type LiberationPayment = "gold" | "enchant_scroll";

type PendingRequest = {
  iid: string;
  revision: number;
  payment: LiberationPayment;
  /** 고정한 줄 번호를 이어 붙인 값. 고정이 바뀌면 새 요청으로 본다. */
  lockKey: string;
  requestId: string;
};

export type EquipmentLiberationPanelProps = {
  owned: readonly V2EquipInstance[];
  equipped: Partial<Record<V2EquipSlot, string>>;
  gold: number;
  bankedGold: number;
  initialItemIid?: string;
  /** 보유한 마법부여서 수. 있으면 골드 대신 1장으로 마법부여할 수 있다. */
  enchantScrolls?: number;
  /** 보유한 세공 보석(재료 id → 개수). 다시 마법부여할 때 남길 줄을 고정하는 데 쓴다. */
  cutGems?: Record<string, number>;
  onCutGemsUpdated?: (cutGems: Record<string, number>) => void;
  onItemUpdated: (item: V2EquipInstance) => void;
  onWalletUpdated: (gold: number, bankedGold: number) => void;
  onEnchantScrollsUpdated?: (count: number) => void;
};

function errorMessage(error: string | undefined): string {
  switch (error) {
    case "insufficient_gold":
      return "골드가 부족합니다.";
    case "insufficient_enchant_scroll":
      return "마법부여서가 부족합니다.";
    case "insufficient_cut_gems":
      return "이 장비에 쓸 수 있는 세공 보석이 모자랍니다.";
    case "invalid_locked_lines":
      return "고정할 줄을 다시 골라 주세요.";
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
  enchantScrolls = 0,
  cutGems = {},
  onCutGemsUpdated,
  onItemUpdated,
  onWalletUpdated,
  onEnchantScrollsUpdated,
}: EquipmentLiberationPanelProps) {
  const candidates = useMemo(
    () => liberationCandidateRows(owned, equipped),
    [equipped, owned],
  );
  const [selectedIid, setSelectedIid] = useState(initialItemIid ?? "");
  const [transferOpen, setTransferOpen] = useState(false);
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [confirmPayment, setConfirmPayment] =
    useState<LiberationPayment | null>(null);
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
  const [lockState, setLockState] = useState<{ iid: string; lines: number[] }>({
    iid: "",
    lines: [],
  });
  const pendingRequest = useRef<PendingRequest | null>(null);
  const selected =
    candidates.find((candidate) => candidate.iid === selectedIid) ??
    candidates[0];
  const instance = selected?.item;
  const item = instance ? V2_EQUIPMENT[instance.id] : undefined;
  const current = instance?.liberation;
  const isReroll = current != null;
  const actionLabel = isReroll ? "재마법부여" : "마법부여";
  const spendable = gold + bankedGold;
  // 줄 고정 — 이미 마법부여한 2줄 이상 장비에서 줄 수보다 하나 적게까지. 줄 하나에 세공 보석 1개와 추가 골드.
  const maxLocks = current ? current.lineCount - 1 : 0;
  const lockedLines =
    instance && lockState.iid === instance.iid
      ? lockState.lines.filter((line) => current != null && line < current.lineCount).slice(0, maxLocks)
      : [];
  const usableCutGems = current
    ? CUT_GEM_GRADES.filter((grade) => cutGemUsableForRank(grade, current.rank)).reduce(
        (total, grade) => total + Math.max(0, Math.floor(Number(cutGems[CUT_GEMS[grade].id]) || 0)),
        0,
      )
    : 0;
  const lockGold = lockedLines.length * LIBERATION_LOCK_GOLD_PER_LINE;
  const cutGemsShort = lockedLines.length > usableCutGems;
  const goldCost = EQUIPMENT_LIBERATION_GOLD_COST + lockGold;

  function toggleLockedLine(line: number): void {
    if (!instance || busy) return;
    const next = lockedLines.includes(line)
      ? lockedLines.filter((item) => item !== line)
      : [...lockedLines, line].sort((left, right) => left - right);
    if (next.length > maxLocks) return;
    setLockState({ iid: instance.iid, lines: next });
  }
  const probabilityRows = item ? liberationOptionProbabilityRows(item.slot) : [];

  function selectEquipment(iid: string): void {
    if (busy) return;
    setSelectedIid(iid);
    setSelectionOpen(false);
    setMessage(null);
    setResult(null);
  }

  function startLiberation(payment: LiberationPayment): void {
    if (isReroll) {
      void submit(payment);
    } else {
      setConfirmPayment(payment);
    }
  }

  async function submit(payment: LiberationPayment): Promise<void> {
    if (!instance || busy) return;
    const revision = equipmentLiberationRevision(instance);
    const reusable = pendingRequest.current;
    const lockKey = lockedLines.join(",");
    const request =
      reusable?.iid === instance.iid &&
      reusable.revision === revision &&
      reusable.payment === payment &&
      reusable.lockKey === lockKey
        ? reusable
        : {
            iid: instance.iid,
            revision,
            payment,
            lockKey,
            requestId: crypto.randomUUID(),
          };
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
          ...(payment === "enchant_scroll" ? { payment } : {}),
          ...(lockedLines.length > 0 ? { lockedLines } : {}),
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
      if (payment === "enchant_scroll") {
        onEnchantScrollsUpdated?.(body.cashItems?.[ENCHANT_SCROLL_ITEM_ID] ?? 0);
      }
      if (body.cutGems) onCutGemsUpdated?.(body.cutGems);
      setResult({
        rank: nextLiberation?.rank ?? previousRank,
        promoted:
          nextLiberation != null && nextLiberation.rank < previousRank,
        revision: nextLiberation?.revision ?? revision + 1,
      });
      setMessage({
        tone: "success",
        text: !isReroll
          ? "장비 마법부여가 완료되었습니다."
          : lockedLines.length > 0
            ? "고정한 줄을 남기고 재마법부여했습니다."
            : "재마법부여가 완료되었습니다.",
      });
    } catch {
      setMessage({
        tone: "warning",
        text: "연결에 실패했습니다. 다시 시도하면 같은 요청으로 안전하게 이어집니다.",
      });
    } finally {
      setBusy(false);
      setConfirmPayment(null);
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

  if (transferOpen && selected) {
    return <EquipmentEnchantmentTransfer
      source={selected}
      candidates={candidates}
      gold={gold}
      bankedGold={bankedGold}
      onItemUpdated={onItemUpdated}
      onClose={() => setTransferOpen(false)}
      onComplete={(response) => {
        onItemUpdated(response.source);
        onItemUpdated(response.target);
        onWalletUpdated(response.gold, response.bankedGold);
        pendingRequest.current = null;
        setTransferOpen(false);
        setResult(null);
        setMessage({ tone: "success", text: "마법부여 이전이 완료되었습니다." });
      }}
    />;
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
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-violet-200 bg-white text-violet-700 shadow-sm transition-colors hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus dark:border-violet-800 dark:bg-zinc-900 dark:text-violet-300 dark:hover:bg-violet-950"
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
          className={`${SURFACE_ACCENT} mt-4 flex min-h-16 w-full items-center justify-between gap-3 border-violet-300 px-4 py-3 text-left shadow-sm transition hover:border-violet-500 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50 dark:border-violet-800 dark:hover:border-violet-500`}
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
            비용 <strong className="text-amber-700 dark:text-amber-300">{goldCost.toLocaleString()} G</strong>
            <span className="ml-2 text-zinc-500 dark:text-zinc-400">
              결제 가능 {spendable.toLocaleString()} G
            </span>
            {enchantScrolls > 0 ? (
              <span className="ml-2 font-semibold text-violet-700 dark:text-violet-300">
                마법부여서 {enchantScrolls.toLocaleString()}장 보유
              </span>
            ) : null}
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
              {current.options.map((option, line) => (
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
                  {maxLocks > 0 ? (
                    <Button
                      size="sm"
                      variant={lockedLines.includes(line) ? "primary" : "secondary"}
                      className="min-h-10 shrink-0"
                      aria-label={`${formatLiberationOptionRoll(option)} 줄 고정`}
                      aria-pressed={lockedLines.includes(line)}
                      disabled={
                        busy || (!lockedLines.includes(line) && lockedLines.length >= maxLocks)
                      }
                      onClick={() => toggleLockedLine(line)}
                    >
                      {lockedLines.includes(line) ? "고정됨" : "고정"}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
            {maxLocks > 0 ? (
              <div className="mt-3 space-y-1 text-xs tabular-nums text-zinc-600 dark:text-zinc-300">
                <p>이 장비에 쓸 수 있는 세공 보석 {usableCutGems.toLocaleString()}개</p>
                {lockedLines.length > 0 ? (
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {lockedLines.length}줄 고정: 세공 보석 {lockedLines.length}개, 골드{" "}
                    {lockGold.toLocaleString()} G 추가
                  </p>
                ) : (
                  <p>
                    남길 줄을 고정하면 그 줄은 그대로 두고 나머지만 다시 정합니다. 줄 하나에 세공 보석 1개와
                    골드 {LIBERATION_LOCK_GOLD_PER_LINE.toLocaleString()} G가 더 듭니다.
                  </p>
                )}
                {cutGemsShort ? (
                  <p className="font-semibold text-rose-600 dark:text-rose-400">
                    이 장비에 쓸 수 있는 세공 보석이 모자랍니다.
                  </p>
                ) : null}
              </div>
            ) : null}
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

        {enchantScrolls > 0 ? (
          <>
            <Button
              className="mt-4 w-full shadow-lg shadow-violet-500/20"
              size="md"
              variant="primary"
              disabled={busy || cutGemsShort || spendable < lockGold}
              onClick={() => startLiberation("enchant_scroll")}
            >
              {busy ? "마법부여 중…" : `마법부여서로 ${actionLabel}`}
            </Button>
            <Button
              className="mt-2"
              fullWidth
              disabled={busy || cutGemsShort || spendable < goldCost}
              onClick={() => startLiberation("gold")}
            >
              골드로 {actionLabel}
            </Button>
          </>
        ) : (
          <Button
            className="mt-4 w-full shadow-lg shadow-violet-500/20"
            size="md"
            variant="primary"
            disabled={busy || cutGemsShort || spendable < goldCost}
            onClick={() => startLiberation("gold")}
          >
            {busy ? "마법부여 중…" : actionLabel}
          </Button>
        )}
        {current ? <Button className="mt-2" fullWidth disabled={busy} onClick={() => {
          setMessage(null);
          setResult(null);
          setTransferOpen(true);
        }}>마법부여 이전</Button> : null}
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
      {confirmPayment && instance ? (
        <InitialEnchantmentConfirmDialog
          itemName={selected.name}
          payLabel={
            confirmPayment === "enchant_scroll"
              ? "마법부여서 1장 쓰고 마법부여"
              : `${EQUIPMENT_LIBERATION_GOLD_COST.toLocaleString()} G 지불하고 마법부여`
          }
          busy={busy}
          onConfirm={() => void submit(confirmPayment)}
          onClose={() => setConfirmPayment(null)}
        />
      ) : null}
    </>
  );
}
