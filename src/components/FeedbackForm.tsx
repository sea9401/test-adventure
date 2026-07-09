"use client";

import { useState } from "react";

const MAX_LENGTH = 1000;
const MIN_LENGTH = 5;
const CATEGORY_OPTIONS = [
  { id: "suggestion", label: "건의" },
  { id: "bug", label: "버그" },
  { id: "balance", label: "밸런스" },
  { id: "ui", label: "UI" },
  { id: "other", label: "기타" },
] as const;

type SubmitState = "idle" | "submitting" | "sent" | "error";

export function FeedbackForm() {
  const [category, setCategory] =
    useState<(typeof CATEGORY_OPTIONS)[number]["id"]>("suggestion");
  const [content, setContent] = useState("");
  const [state, setState] = useState<SubmitState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const trimmed = content.trim();
  const canSubmit =
    state !== "submitting" &&
    trimmed.length >= MIN_LENGTH &&
    trimmed.length <= MAX_LENGTH;

  async function submit() {
    if (!canSubmit) return;
    setState("submitting");
    setMessage(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          category,
          content: trimmed,
          path: window.location.pathname,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!res.ok || !data?.ok) {
        const error = data?.error;
        setState("error");
        setMessage(
          error === "rate_limited"
            ? "잠시 후 다시 보내주세요."
            : error === "too_long"
              ? "내용을 조금 줄여주세요."
              : "전송하지 못했어요.",
        );
        return;
      }
      setState("sent");
      setMessage("접수됐어요.");
      setContent("");
    } catch {
      setState("error");
      setMessage("전송하지 못했어요.");
    }
  }

  return (
    <section className="rounded-md border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      <div className="space-y-3 px-4 py-4">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {CATEGORY_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setCategory(option.id)}
              className={`h-8 shrink-0 rounded-md border px-2.5 text-xs font-medium ${
                category === option.id
                  ? "border-sky-500 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-950/50 dark:text-sky-300"
                  : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <label className="block">
          <span className="sr-only">건의 내용</span>
          <textarea
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              if (state !== "submitting") {
                setState("idle");
                setMessage(null);
              }
            }}
            maxLength={MAX_LENGTH}
            rows={12}
            placeholder="불편한 점이나 바라는 점을 적어주세요."
            className="min-h-64 w-full resize-y rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-sky-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </label>
        <div className="flex items-center justify-between gap-3 text-xs text-zinc-500 dark:text-zinc-400">
          <span role="status" aria-live="polite">
            {message}
          </span>
          <span className="shrink-0 tabular-nums">
            {trimmed.length} / {MAX_LENGTH}
          </span>
        </div>
      </div>
      <div className="flex justify-end border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="h-9 rounded-md border border-sky-600 bg-sky-600 px-3 text-sm font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {state === "submitting" ? "전송 중" : "보내기"}
        </button>
      </div>
    </section>
  );
}
