"use client";

import { useRef } from "react";
import { X } from "@phosphor-icons/react";
import { useModalA11y } from "@/lib/useModalA11y";
import type { Npc } from "./data/npcs";
import { NpcAvatar } from "./NpcAvatar";

export type NpcDialogueAction = {
  label: string;
  onClick: () => void;
};

// 활성 의뢰 안내 — 대사 본문 아래에 "▶ 할 일" 박스로 표시. 산문 톤의 대사 안에 묻혀
// 다음 단계가 안 보이는 문제를 풀기 위함. body 는 어디서 무엇을 / progress 는 N/M.
export type NpcObjective = {
  body: string;
  progress?: string;
};

export function NpcDialogue({
  npc,
  onClose,
  text,
  primaryAction,
  closeLabel = "떠나기",
  objective,
}: {
  npc: Npc;
  onClose: () => void;
  text?: string;
  primaryAction?: NpcDialogueAction;
  closeLabel?: string;
  objective?: NpcObjective;
}) {
  // primaryAction 중복 실행 방지 — 이전엔 보상 지급(영웅검·골드·포션 등)을 동기 호출 후
  // 닫는 핸들러가 React 리렌더 전 추가 클릭으로 두 번 실행돼 유니크 장비까지 복제됐다.
  // label 단위 일회성 락 — 다음 단계(label 변경)로 진행되면 자연스럽게 해제.
  const firedLabelRef = useRef<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  useModalA11y(contentRef);
  const handlePrimary = primaryAction
    ? () => {
        if (firedLabelRef.current === primaryAction.label) return;
        firedLabelRef.current = primaryAction.label;
        primaryAction.onClick();
      }
    : undefined;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="npc-dialogue-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        ref={contentRef}
        className="w-full max-w-lg rounded-lg border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-4">
            <NpcAvatar npc={npc} size={112} />
            <div className="min-w-0">
              <div
                id="npc-dialogue-title"
                className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
              >
                {npc.name}
              </div>
              <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {npc.description}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="shrink-0 rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        <p className="mt-5 whitespace-pre-line text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
          {text ?? npc.greeting}
        </p>

        {objective && (
          <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-900/60 dark:bg-amber-950/30">
            <div className="text-xs font-semibold text-amber-900 dark:text-amber-200">
              ▶ 할 일
            </div>
            <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
              {objective.body}
            </p>
            {objective.progress && (
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {objective.progress}
              </p>
            )}
          </div>
        )}

        <div className="mt-5 flex flex-col gap-2">
          {primaryAction && (
            <button
              type="button"
              onClick={handlePrimary}
              className="w-full rounded-md bg-amber-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600"
            >
              {primaryAction.label}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {closeLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
