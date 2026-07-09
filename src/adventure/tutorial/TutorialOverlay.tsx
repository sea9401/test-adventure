"use client";

import { useRef, type ReactNode } from "react";
import { GraduationCap, X } from "@phosphor-icons/react";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";
import { useTutorial } from "./useTutorial";
import type { TutorialStepId } from "./flags";

type Props = {
  stepId: TutorialStepId;
  title: string;
  body: ReactNode;
  dismissLabel?: string;
};

export function TutorialOverlay(props: Props) {
  const { shown, dismiss } = useTutorial(props.stepId);
  if (!shown) return null;
  return <TutorialOverlayInner {...props} onDismiss={dismiss} />;
}

// controlled 모드 — 호출자가 단일 useStoryFlags 인스턴스로 shown/dismiss 직접
// 관리할 때. TutorialOverlay (uncontrolled) 와 다르게 useStoryFlags 새 인스턴스를
// 마운트 안 함 → 두 인스턴스 PATCH race 차단. 호출자가 shown=false 일 땐 mount X.
export function TutorialOverlayInner({
  title,
  body,
  dismissLabel = "이해했어요",
  onDismiss,
}: Omit<Props, "stepId"> & { onDismiss: () => void }) {
  useEscapeKey(onDismiss);
  const contentRef = useRef<HTMLDivElement>(null);
  useModalA11y(contentRef);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-overlay-title"
      onClick={onDismiss}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div
        ref={contentRef}
        onClick={(e) => e.stopPropagation()}
        className="no-scrollbar max-h-[85vh] w-full max-w-md overflow-y-auto rounded-lg border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <GraduationCap
              size={22}
              weight="duotone"
              className="mt-0.5 shrink-0 text-sky-600 dark:text-sky-400"
              aria-hidden
            />
            <h2
              id="tutorial-overlay-title"
              className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
            >
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="닫기"
            className="-mr-2 -mt-1 inline-flex h-10 w-10 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        <div className="mt-4 space-y-3 text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">
          {body}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex items-center justify-center rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-sky-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
          >
            {dismissLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
