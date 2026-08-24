"use client";

import { useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ArrowClockwise,
  ListBullets,
  MapTrifold,
  X,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { SURFACE_CARD } from "@/components/ui/surfaces";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";

export function HuntResultSheet({
  open,
  title,
  children,
  onClose,
  onRepeat,
  onViewLog,
  rareMapAction,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  onRepeat: () => void;
  onViewLog?: () => void;
  rareMapAction?: {
    label: string;
    onClick: () => void;
  };
}) {
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <OpenHuntResultSheet
      title={title}
      onClose={onClose}
      onRepeat={onRepeat}
      onViewLog={onViewLog}
      rareMapAction={rareMapAction}
    >
      {children}
    </OpenHuntResultSheet>,
    document.body,
  );
}

function OpenHuntResultSheet({
  title,
  children,
  onClose,
  onRepeat,
  onViewLog,
  rareMapAction,
}: Omit<Parameters<typeof HuntResultSheet>[0], "open">) {
  const contentRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModalA11y(contentRef);
  useEscapeKey(onClose);
  return (
    <div
      className="fixed inset-0 z-[140] flex items-end justify-center bg-black/55 px-0 sm:px-4"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`${SURFACE_CARD} ui-game-card flex max-h-[75dvh] w-full max-w-[720px] flex-col rounded-b-none pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl sm:mb-3 sm:rounded-b-xl`}
      >
        <header className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-b border-zinc-200 px-4 dark:border-zinc-700">
          <h2 id={titleId} className="font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
          <Button type="button" onClick={onClose} aria-label="결과 닫기" variant="ghost" size="icon">
            <X size={20} aria-hidden />
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
          {children}
        </div>
        <footer
          className={`grid shrink-0 grid-cols-2 gap-2 border-t border-zinc-200 px-3 pt-3 dark:border-zinc-700 ${
            rareMapAction ? "sm:grid-cols-2" : "sm:grid-cols-[1fr_auto_auto]"
          }`}
        >
          <Button
            type="button"
            onClick={onRepeat}
            variant="primary"
            size="md"
            className={`col-span-2 ${rareMapAction ? "" : "sm:col-span-1"}`}
          >
            <ArrowClockwise size={18} aria-hidden /> 다시 사냥
          </Button>
          {rareMapAction && (
            <Button
              type="button"
              onClick={rareMapAction.onClick}
              variant="warning"
              size="md"
              className="col-span-2"
            >
              <MapTrifold size={18} aria-hidden /> {rareMapAction.label}
            </Button>
          )}
          {onViewLog && (
            <Button type="button" onClick={onViewLog} variant="secondary" size="md">
              <ListBullets size={17} aria-hidden /> 전투 기록 보기
            </Button>
          )}
          <Button type="button" onClick={onClose} variant="secondary" size="md">
            닫기
          </Button>
        </footer>
      </div>
    </div>
  );
}
