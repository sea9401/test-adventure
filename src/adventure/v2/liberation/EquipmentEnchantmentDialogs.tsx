"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { MagnifyingGlass, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import {
  SURFACE_ACCENT,
  SURFACE_CARD,
  SURFACE_INSET,
} from "@/components/ui/surfaces";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";
import {
  LIBERATION_LINE_COUNT_CHANCES,
  enchantmentStage,
  liberationPromotionChancePct,
  liberationRankLevelDistribution,
  liberationRankLevelSummary,
  type LiberationCandidateRow,
  type LiberationOptionProbabilityRow,
} from "./equipmentLiberationViewModel";

function DialogCloseButton({
  label,
  onClick,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
    >
      <X size={18} weight="bold" aria-hidden />
    </button>
  );
}

export function EquipmentSelectionDialog({
  candidates,
  selectedIid,
  busy,
  onSelect,
  onClose,
}: {
  candidates: readonly LiberationCandidateRow[];
  selectedIid: string;
  busy: boolean;
  onSelect: (iid: string) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const closeIfIdle = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko");
    if (!normalized) return candidates;
    return candidates.filter((candidate) =>
      candidate.name.toLocaleLowerCase("ko").includes(normalized),
    );
  }, [candidates, query]);

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
        aria-labelledby="equipment-enchantment-picker-title"
        className={`${SURFACE_CARD} ui-modal-panel flex max-h-[min(88vh,760px)] w-full max-w-xl flex-col p-4 shadow-2xl sm:p-5`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">
              마법부여 대상 변경
            </p>
            <h2 id="equipment-enchantment-picker-title" className="mt-0.5 text-lg font-bold">
              마법부여 장비 선택
            </h2>
          </div>
          <DialogCloseButton label="장비 선택 닫기" onClick={closeIfIdle} disabled={busy} />
        </div>

        <label className="relative mt-4 block">
          <MagnifyingGlass
            size={16}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="장비 이름 검색"
            placeholder="장비 이름 검색"
            className="min-h-11 w-full rounded-lg border border-zinc-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-violet-400 dark:focus:ring-violet-900"
          />
        </label>

        <div
          className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1"
          role="listbox"
          aria-label="마법부여 대상 장비"
        >
          {filtered.length > 0 ? (
            filtered.map((candidate) => {
              const active = candidate.iid === selectedIid;
              const state = candidate.rank
                ? `마법부여 ${enchantmentStage(candidate.rank)}단계 · ${candidate.lineCount}줄`
                : "미마법부여";
              return (
                <button
                  key={candidate.iid}
                  type="button"
                  role="option"
                  aria-selected={active}
                  disabled={busy}
                  onClick={() => onSelect(candidate.iid)}
                  className={`${SURFACE_INSET} w-full px-3 py-3 text-left transition-colors disabled:opacity-50 ${
                    active
                      ? "border-violet-500 ring-2 ring-violet-200 dark:border-violet-400 dark:ring-violet-900"
                      : "hover:border-violet-400 dark:hover:border-violet-500"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{candidate.name}</span>
                    {candidate.isEquipped ? (
                      <span className="shrink-0 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                        장착 중
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {candidate.displayTier}T · {state}
                  </div>
                </button>
              );
            })
          ) : (
            <p className={`${SURFACE_INSET} p-4 text-center text-sm text-zinc-500 dark:text-zinc-400`}>
              검색 결과가 없습니다.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function EquipmentEnchantmentGuideDialog({
  probabilityRows,
  onClose,
}: {
  probabilityRows: readonly LiberationOptionProbabilityRow[];
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEscapeKey(onClose);
  useModalA11y(panelRef);

  return (
    <div
      className="ui-modal-reveal fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="equipment-enchantment-guide-title"
        className={`${SURFACE_CARD} ui-modal-panel max-h-[min(90vh,820px)] w-full max-w-2xl overflow-y-auto p-4 shadow-2xl sm:p-5`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">
              확률과 단계 정보
            </p>
            <h2 id="equipment-enchantment-guide-title" className="mt-0.5 text-lg font-bold">
              마법부여 도움말
            </h2>
          </div>
          <DialogCloseButton label="도움말 닫기" onClick={onClose} />
        </div>

        <section className={`${SURFACE_ACCENT} mt-4 p-3 text-sm`}>
          <h3 className="font-bold">최초 옵션 줄 수</h3>
          <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
            최초 마법부여에서 결정되며 이후 재마법부여를 해도 늘어나거나 줄어들지 않습니다.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {LIBERATION_LINE_COUNT_CHANCES.map(({ lineCount, chancePct }) => (
              <span
                key={lineCount}
                className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold dark:border-amber-800 dark:bg-zinc-900"
              >
                {lineCount}줄 {chancePct}%
              </span>
            ))}
          </div>
        </section>

        <section className="mt-4 space-y-2">
          <h3 className="font-bold">단계별 옵션 레벨</h3>
          {([3, 2, 1] as const).map((rank) => {
            const nextStage = enchantmentStage(rank) + 1;
            const promotion = liberationPromotionChancePct(rank);
            return (
              <div key={rank} className={`${SURFACE_INSET} p-3`}>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <strong>{liberationRankLevelSummary(rank)}</strong>
                  <span className="text-xs font-medium text-violet-700 dark:text-violet-300">
                    {promotion > 0 ? `${nextStage}단계 승급 ${promotion}%` : "최고 단계 유지"}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                  {liberationRankLevelDistribution(rank)
                    .map(({ level, chancePct }) => `Lv.${level} ${chancePct}%`)
                    .join(" · ")}
                </p>
              </div>
            );
          })}
        </section>

        <section className="mt-4">
          <h3 className="font-bold">옵션 출현 확률</h3>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            2·3번째 줄은 이미 선택된 옵션을 제외하고 남은 가중치로 다시 계산됩니다.
          </p>
          <div className={`${SURFACE_INSET} mt-3 max-h-64 overflow-auto p-3`}>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-zinc-500 dark:text-zinc-400">
                  <th className="py-1">옵션</th>
                  <th>가중치</th>
                  <th>첫 줄 확률</th>
                </tr>
              </thead>
              <tbody>
                {probabilityRows.map((row) => (
                  <tr key={row.id} className="border-t border-zinc-200 dark:border-zinc-700">
                    <td className="py-1.5 pr-2 font-medium">{row.label}</td>
                    <td className="pr-2 tabular-nums">{row.weight}</td>
                    <td className="tabular-nums">{row.firstLineChancePct.toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

export function InitialEnchantmentConfirmDialog({
  itemName,
  goldCost,
  busy,
  onConfirm,
  onClose,
}: {
  itemName: string;
  goldCost: number;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeIfIdle = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);
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
        aria-labelledby="initial-enchantment-confirm-title"
        aria-describedby="initial-enchantment-confirm-description"
        className={`${SURFACE_CARD} ui-modal-panel w-full max-w-md p-5 shadow-2xl`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">
              최초 1회 확인
            </p>
            <h2 id="initial-enchantment-confirm-title" className="mt-1 text-lg font-bold">
              최초 마법부여 확인
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              {itemName}에 마법부여할까요?
            </p>
          </div>
          <DialogCloseButton label="마법부여 확인 닫기" onClick={closeIfIdle} disabled={busy} />
        </div>

        <div id="initial-enchantment-confirm-description" className={`${SURFACE_ACCENT} mt-4 space-y-2 p-3 text-sm leading-relaxed`}>
          <p>
            마법부여된 장비는 <strong>즉시 귀속</strong>되어 거래할 수 없습니다.
          </p>
          <p>
            결정된 <strong>옵션 줄 수는 영구 고정</strong>되며 재마법부여로 늘릴 수 없습니다.
          </p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button size="md" disabled={busy} onClick={closeIfIdle}>
            취소
          </Button>
          <Button size="md" variant="primary" disabled={busy} onClick={onConfirm}>
            {busy ? "마법부여 중…" : `${goldCost.toLocaleString()} G 지불하고 마법부여`}
          </Button>
        </div>
      </div>
    </div>
  );
}
