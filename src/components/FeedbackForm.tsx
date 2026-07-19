"use client";

import Image from "next/image";
import { ImageSquare, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FEEDBACK_IMAGE_MAX_BYTES } from "@/lib/feedbackImage";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";

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

function submitErrorMessage(error: string | undefined) {
  if (error === "rate_limited") return "잠시 후 다시 보내주세요.";
  if (error === "too_long") return "내용을 조금 줄여주세요.";
  if (error === "not_image" || error === "invalid_file") {
    return "JPG, PNG, WebP 이미지 파일만 첨부할 수 있어요.";
  }
  if (error === "image_too_large") return "이미지는 5MB 이하여야 해요.";
  if (error === "image_dimensions") {
    return "가로·세로 4096px 이하 이미지를 첨부해 주세요.";
  }
  if (error === "storage_unavailable" || error === "storage_error") {
    return "이미지 저장에 실패했어요. 잠시 후 다시 시도해 주세요.";
  }
  return "전송하지 못했어요.";
}

export function FeedbackForm({ onSent }: { onSent?: () => void }) {
  const [category, setCategory] =
    useState<(typeof CATEGORY_OPTIONS)[number]["id"]>("suggestion");
  const [content, setContent] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [state, setState] = useState<SubmitState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const trimmed = content.trim();
  const canSubmit =
    state !== "submitting" &&
    trimmed.length >= MIN_LENGTH &&
    trimmed.length <= MAX_LENGTH;
  const imagePreview = useMemo(
    () => (image ? URL.createObjectURL(image) : null),
    [image],
  );

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  function clearImage() {
    setImage(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  }

  async function submit() {
    if (!canSubmit) return;
    setState("submitting");
    setMessage(null);
    try {
      const formData = new FormData();
      formData.set("category", category);
      formData.set("content", trimmed);
      formData.set("path", window.location.pathname);
      if (image) formData.set("image", image);
      const res = await fetch("/api/feedback", {
        method: "POST",
        body: formData,
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!res.ok || !data?.ok) {
        const error = data?.error;
        setState("error");
        setMessage(submitErrorMessage(error));
        return;
      }
      setState("sent");
      setMessage("접수됐어요.");
      setContent("");
      clearImage();
      onSent?.();
    } catch {
      setState("error");
      setMessage("전송하지 못했어요.");
    }
  }

  return (
    <section className={SURFACE_CARD}>
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
        <div className={`${SURFACE_INSET} p-3`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
                이미지 첨부 <span className="font-normal text-zinc-400">(선택)</span>
              </p>
              <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                JPG·PNG·WebP, 최대 5MB · 1장
              </p>
            </div>
            {!image && (
              <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800">
                <ImageSquare size={16} />
                이미지 선택
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    if (!file) return;
                    if (
                      !["image/jpeg", "image/png", "image/webp"].includes(file.type)
                    ) {
                      clearImage();
                      setState("error");
                      setMessage("JPG, PNG, WebP 이미지 파일만 첨부할 수 있어요.");
                      return;
                    }
                    if (file.size > FEEDBACK_IMAGE_MAX_BYTES) {
                      clearImage();
                      setState("error");
                      setMessage("이미지는 5MB 이하여야 해요.");
                      return;
                    }
                    setImage(file);
                    setState("idle");
                    setMessage(null);
                  }}
                />
              </label>
            )}
          </div>
          {image && imagePreview && (
            <div className="mt-3 flex items-start gap-3">
              <Image
                src={imagePreview}
                alt="첨부 이미지 미리보기"
                width={160}
                height={120}
                unoptimized
                className="h-24 w-32 rounded-md border border-zinc-200 object-cover dark:border-zinc-700"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-zinc-700 dark:text-zinc-200">
                  {image.name}
                </p>
                <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                  {(image.size / 1024 / 1024).toFixed(2)}MB
                </p>
                <button
                  type="button"
                  onClick={clearImage}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-rose-600 hover:text-rose-700 dark:text-rose-400"
                >
                  <X size={14} weight="bold" />
                  첨부 취소
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 text-xs text-zinc-500 dark:text-zinc-400">
          <span role="status" aria-live="polite">
            {message}
          </span>
          <span className="shrink-0 tabular-nums">
            {trimmed.length} / {MAX_LENGTH}
          </span>
        </div>
      </div>
      <div className="flex justify-end border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
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
