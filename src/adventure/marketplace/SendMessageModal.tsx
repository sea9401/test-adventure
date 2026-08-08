"use client";

import { useRef, useState } from "react";
import { X } from "@phosphor-icons/react";
import { USER_MESSAGE_MAX_LENGTH } from "@/lib/inbox-config";
import { sendUserMessage } from "./api";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";
import { SURFACE_CARD } from "@/components/ui/surfaces";

// 플라자 쪽지 보내기 모달. 순수 텍스트 쪽지.
// (옛 V1 "제작서 첨부 선물" 기능은 제거 — v2 엔 레시피 공유 토큰 개념이 없고, 그걸 위해
//  GameContext(useGame) 를 쓰던 게 (game) 트리에 GameProvider 가 없어 크래시를 냈다.
//  이 컴포넌트가 라이브 플라자의 유일한 GameContext 의존이었다.)

type Props = {
  initialRecipient?: string;
  onClose: () => void;
  onSent?: (recipientName: string) => void;
};

export function SendMessageModal({
  initialRecipient = "",
  onClose,
  onSent,
}: Props) {
  useEscapeKey(onClose);
  const contentRef = useRef<HTMLDivElement>(null);
  useModalA11y(contentRef);
  const [recipient, setRecipient] = useState(initialRecipient);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const trimmedRecipient = recipient.trim();
  const trimmedDraft = draft.trim();
  const canSubmit =
    trimmedRecipient.length > 0 &&
    trimmedDraft.length > 0 &&
    trimmedDraft.length <= USER_MESSAGE_MAX_LENGTH &&
    !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setErr(null);
    try {
      const r = await sendUserMessage(trimmedRecipient, trimmedDraft);
      onSent?.(r.recipientName);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "전송 실패");
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="send-message-title"
      onClick={onClose}
      className="ui-modal-reveal fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-4"
    >
      <div
        ref={contentRef}
        onClick={(e) => e.stopPropagation()}
        className={`ui-modal-panel ${SURFACE_CARD} flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col overflow-hidden shadow-xl`}
      >
        <div className="flex shrink-0 items-start justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-700 sm:px-6">
          <h2
            id="send-message-title"
            className="text-base font-semibold text-zinc-900 dark:text-zinc-100"
          >
            쪽지 보내기
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
            받는 사람 (닉네임)
          </label>
          <input
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            autoFocus={initialRecipient.length === 0}
            disabled={submitting}
            maxLength={64}
            placeholder="닉네임"
            className="mt-1.5 w-full rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2.5 text-sm outline-none transition-colors focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-400"
          />

          <label className="mt-4 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
            내용
          </label>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={8}
            autoFocus={initialRecipient.length > 0}
            maxLength={USER_MESSAGE_MAX_LENGTH + 50}
            placeholder="쪽지 내용을 적어보세요"
            disabled={submitting}
            className="mt-1.5 min-h-48 max-h-[50vh] w-full resize-y rounded-md border border-zinc-300 bg-zinc-50 px-4 py-3 text-[15px] leading-6 outline-none transition-colors focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-400"
          />
          <div className="mt-1.5 flex items-start justify-between gap-4 text-xs">
            <span
              className={
                trimmedDraft.length > USER_MESSAGE_MAX_LENGTH
                  ? "text-rose-600"
                  : "text-zinc-500 dark:text-zinc-400"
              }
            >
              {trimmedDraft.length} / {USER_MESSAGE_MAX_LENGTH}
            </span>
            {err && <span className="text-right text-rose-600">{err}</span>}
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-zinc-200 px-5 py-3.5 dark:border-zinc-700 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            취소
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="rounded-md border border-emerald-700 bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? "전송 중…" : "전송"}
          </button>
        </div>
      </div>
    </div>
  );
}
