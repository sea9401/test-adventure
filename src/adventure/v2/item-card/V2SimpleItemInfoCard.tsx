"use client";

import { useEffect, type CSSProperties } from "react";
import { X } from "@phosphor-icons/react";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import {
  GAP,
  MARGIN,
  WIDTH,
  type ItemCardAnchor,
} from "./shared";

export type V2SimpleInfoLine = {
  label: string;
  value: string;
};

export function V2SimpleItemInfoCard({
  title,
  subtitle,
  description,
  anchor,
  onClose,
  lines = [],
}: {
  title: string;
  subtitle?: string;
  description?: string;
  anchor: ItemCardAnchor;
  onClose: () => void;
  lines?: V2SimpleInfoLine[];
}) {
  useEscapeKey(onClose);

  useEffect(() => {
    window.addEventListener("scroll", onClose);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("scroll", onClose);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  const vw = typeof window !== "undefined" ? window.innerWidth : 360;
  const vh = typeof window !== "undefined" ? window.innerHeight : 640;
  const width = Math.min(WIDTH, vw - MARGIN * 2);
  const left = Math.min(Math.max(MARGIN, anchor.left), vw - width - MARGIN);
  const placeAbove = anchor.bottom > vh * 0.6;
  const pos: CSSProperties = placeAbove
    ? { bottom: vh - anchor.top + GAP, maxHeight: anchor.top - GAP - MARGIN }
    : { top: anchor.bottom + GAP, maxHeight: vh - anchor.bottom - GAP - MARGIN };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label={`${title} 정보`}
        style={{ position: "fixed", width, left, ...pos }}
        className="z-50 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold leading-tight text-zinc-800 dark:text-zinc-100">
              {title}
            </h2>
            {subtitle ? (
              <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {subtitle}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="-mr-1.5 -mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        {lines.length > 0 ? (
          <div className={`${SURFACE_INSET} mt-3 space-y-0.5 p-2`}>
            {lines.map((line) => (
              <div
                key={line.label}
                className="flex items-baseline justify-between gap-2 text-xs"
              >
                <span className="text-zinc-500 dark:text-zinc-400">
                  {line.label}
                </span>
                <span className="text-right tabular-nums text-zinc-700 dark:text-zinc-200">
                  {line.value}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {description ? (
          <p className="mt-3 border-t border-zinc-200 pt-3 text-xs leading-relaxed text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
            {description}
          </p>
        ) : null}
      </div>
    </>
  );
}

