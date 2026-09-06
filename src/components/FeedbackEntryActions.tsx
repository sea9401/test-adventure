"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import { canEditFeedback, type FeedbackEditState } from "@/lib/feedbackUserEdit";

const CATEGORIES = {
  suggestion: "건의",
  bug: "버그",
  balance: "밸런스",
  ui: "UI",
  other: "기타",
};
const INPUT = "rounded border border-zinc-300 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900";
const ERRORS: Record<string, string> = {
  not_editable: "관리자가 확인했거나 삭제된 건의는 수정·삭제할 수 없습니다.",
  too_short: "내용을 5자 이상 입력해 주세요.",
  too_long: "내용은 1,000자까지 입력할 수 있습니다.",
};

export function FeedbackEntryActions({ entry, onChanged }: {
  entry: FeedbackEditState & { id: number; content: string; category: string };
  onChanged: (deleted: boolean) => void;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [content, setContent] = useState(entry.content);
  const [category, setCategory] = useState(entry.category);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [locked, setLocked] = useState(false);
  const errorMessage = error ? (
    <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p>
  ) : null;
  if (!canEditFeedback(entry) || locked) return errorMessage;

  function cancel() {
    setMode("view");
    setError("");
  }

  async function submit(method: "PATCH" | "DELETE") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/feedback/${entry.id}`, {
        method,
        ...(method === "PATCH" ? {
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content, category }),
        } : {}),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        if (result.error === "not_editable") setLocked(true);
        throw new Error(ERRORS[result.error] ?? "처리하지 못했습니다. 다시 시도해 주세요.");
      }
      setMode("view");
      onChanged(method === "DELETE");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "처리 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {mode === "view" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => {
            setContent(entry.content);
            setCategory(entry.category);
            setMode("edit");
          }}>수정</Button>
          <Button size="sm" variant="secondary" onClick={() => setMode("delete")}>삭제</Button>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            관리자 확인 전까지 수정·삭제할 수 있습니다.
          </span>
        </div>
      ) : mode === "edit" ? (
        <form className={`${SURFACE_INSET} space-y-3 p-3`} onSubmit={(event) => {
          event.preventDefault();
          void submit("PATCH");
        }}>
          <label className="block text-sm">
            분류
            <select
              aria-label="건의 분류 수정"
              value={category}
              disabled={busy}
              onChange={(event) => setCategory(event.target.value)}
              className={`ml-2 ${INPUT}`}
            >
              {Object.entries(CATEGORIES).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            내용
            <textarea
              aria-label="건의 내용 수정"
              value={content}
              minLength={5}
              maxLength={1000}
              required
              disabled={busy}
              onChange={(event) => setContent(event.target.value)}
              rows={6}
              className={`mt-1 block w-full ${INPUT}`}
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit" size="sm" variant="primary" disabled={busy || content.trim().length < 5}>
              {busy ? "저장 중…" : "저장"}
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={cancel}>취소</Button>
          </div>
        </form>
      ) : (
        <div className={`${SURFACE_INSET} space-y-2 p-3`}>
          <p className="text-sm">이 건의를 삭제할까요? 삭제한 내용은 복구할 수 없습니다.</p>
          <div className="flex gap-2">
            <Button size="sm" variant="danger" disabled={busy} onClick={() => void submit("DELETE")}>
              {busy ? "삭제 중…" : "삭제 확인"}
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={cancel}>취소</Button>
          </div>
        </div>
      )}
      {errorMessage}
    </div>
  );
}
