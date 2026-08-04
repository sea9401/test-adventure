"use client";

import { PaperPlaneTilt, Sword, X } from "@phosphor-icons/react";
import { CHAT_MAX_LENGTH } from "@/lib/chat-config";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import {
  chatEquipmentLinkLabel,
  type ChatEquipmentLink,
} from "@/lib/chat-item-link";

// 채팅 입력 폼 — 텍스트 입력 + 전송 버튼.
export function ChatComposer({
  draft,
  itemLink,
  onDraftChange,
  onOpenItemPicker,
  onRemoveItemLink,
  onSubmit,
}: {
  draft: string;
  itemLink?: ChatEquipmentLink | null;
  onDraftChange: (value: string) => void;
  onOpenItemPicker: () => void;
  onRemoveItemLink: () => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="border-t border-zinc-200 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-zinc-800"
    >
      {itemLink ? (
        <div className={`${SURFACE_INSET} mb-2 flex items-center gap-2 px-2.5 py-2`}>
          <Sword size={16} weight="duotone" className="shrink-0 text-sky-600 dark:text-sky-300" />
          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-700 dark:text-zinc-200">
            {chatEquipmentLinkLabel(itemLink)}
          </span>
          <span className="shrink-0 text-[10px] text-zinc-500 dark:text-zinc-400">
            옵션 첨부
          </span>
          <button
            type="button"
            onClick={onRemoveItemLink}
            aria-label="첨부한 장비 제거"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <X size={14} weight="bold" />
          </button>
        </div>
      ) : null}
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onOpenItemPicker}
          aria-label="보유 장비 링크 첨부"
          title="장비 링크"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white text-sky-600 transition-colors hover:bg-sky-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-sky-300 dark:hover:bg-sky-950"
        >
          <Sword size={20} weight="duotone" />
        </button>
        <input
          type="text"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          maxLength={CHAT_MAX_LENGTH}
          placeholder="메시지를 입력하세요"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-base text-zinc-900 outline-none transition-colors focus:border-blue-500 sm:text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-blue-400"
        />
        <button
          type="submit"
          disabled={!draft.trim() && !itemLink}
          aria-label="전송"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-500 text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-zinc-300 dark:disabled:bg-zinc-700"
        >
          <PaperPlaneTilt size={20} weight="fill" />
        </button>
      </div>
    </form>
  );
}
