"use client";

import { useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "@phosphor-icons/react";
import { BattleLogList } from "@/adventure/battle/BattleLogList";
import type { BattleLogEntry } from "@/adventure/v2/combat/engine";
import { SURFACE_CARD } from "@/components/ui/surfaces";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";

export function SparringFullLogDialog({
  entries,
  playerName,
  enemyName,
  onClose,
}: {
  entries: BattleLogEntry[];
  playerName: string;
  enemyName: string;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEscapeKey(onClose);
  useModalA11y(panelRef);

  return createPortal(
    <div
      className="ui-modal-reveal fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center sm:p-5"
      onMouseDown={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sparring-full-log-title"
        className={`${SURFACE_CARD} ui-modal-panel flex max-h-[calc(100dvh-1.5rem)] w-full max-w-[760px] flex-col overflow-hidden sm:max-h-[min(90dvh,860px)]`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-zinc-200 p-4 dark:border-zinc-700">
          <div className="min-w-0 flex-1">
            <h2
              id="sparring-full-log-title"
              className="text-base font-semibold text-zinc-900 dark:text-zinc-100"
            >
              허수아비 전체 전투 로그
            </h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {enemyName} · {entries.length.toLocaleString()}개 기록 · 첫 행동부터 표시
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="전체 전투 로그 닫기"
            className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <X size={19} aria-hidden />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto p-3 sm:p-4">
          <BattleLogList
            entries={entries}
            playerName={playerName}
            enemyName={enemyName}
          />
          <div className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-700">
            <button
              type="button"
              onClick={onClose}
              aria-label="전체 전투 로그 하단에서 닫기"
              className="min-h-11 w-full rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              로그 닫기
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
