"use client";

import { PaperPlaneTilt } from "@phosphor-icons/react";
import { CHAT_MAX_LENGTH } from "@/lib/chat-config";

// 채팅 입력 폼 — 텍스트 입력 + 전송 버튼.
export function ChatComposer({
  draft,
  onDraftChange,
  onSubmit,
}: {
  draft: string;
  onDraftChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="flex items-center gap-2 border-t border-zinc-200 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] dark:border-zinc-800"
    >
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
        className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-blue-400"
      />
      <button
        type="submit"
        disabled={!draft.trim()}
        aria-label="전송"
        className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-blue-500 text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-zinc-300 dark:disabled:bg-zinc-700"
      >
        <PaperPlaneTilt size={18} weight="fill" />
      </button>
    </form>
  );
}
