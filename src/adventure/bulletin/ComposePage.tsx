"use client";

import { useState } from "react";
import { ArrowLeft, Globe, UsersThree } from "@phosphor-icons/react";
import {
  BULLETIN_CATEGORIES,
  BULLETIN_CATEGORY_LABELS,
  BULLETIN_MAX_LENGTH,
  BULLETIN_TITLE_MAX_LENGTH,
  USER_WRITABLE_CATEGORIES,
  type BulletinCategory,
} from "@/lib/bulletin-config";

// 글쓰기 페이지 — 모달이 아니라 인라인 화면. PlazaScreen 의 "게시판" 헤더 아래 영역을
// 통째로 차지한다. 모바일에서 textarea 가 화면 가로폭 전부를 쓸 수 있어 긴 글 작성에 유리.
// editing 을 주면 수정 모드 — 제목/본문 초기값 채움 + 카테고리 변경 불가(픽커 숨김).
export function ComposePage({
  initialCategory,
  isAdmin,
  guild,
  editing,
  onCancel,
  onSubmit,
}: {
  initialCategory: BulletinCategory;
  isAdmin: boolean;
  guild: { id: number; name: string } | null;
  editing?: { title: string; content: string };
  onCancel: () => void;
  onSubmit: (input: {
    category: BulletinCategory;
    scope: "public" | "guild";
    title: string;
    content: string;
  }) => Promise<void>;
}) {
  const [category, setCategory] = useState<BulletinCategory>(initialCategory);
  const [scope, setScope] = useState<"public" | "guild">("public");
  const [titleDraft, setTitleDraft] = useState(editing?.title ?? "");
  const [draft, setDraft] = useState(editing?.content ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const trimmed = draft.trim();
  const trimmedTitle = titleDraft.trim();
  const canSubmit =
    trimmedTitle.length > 0 &&
    trimmedTitle.length <= BULLETIN_TITLE_MAX_LENGTH &&
    trimmed.length > 0 &&
    trimmed.length <= BULLETIN_MAX_LENGTH &&
    !submitting;

  // 작성 가능 카테고리 — admin 은 전체, 일반 유저는 USER_WRITABLE_CATEGORIES.
  const selectableCategories: ReadonlyArray<BulletinCategory> = isAdmin
    ? BULLETIN_CATEGORIES
    : USER_WRITABLE_CATEGORIES;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setErr(null);
    try {
      await onSubmit({
        category,
        scope: editing ? "public" : scope,
        title: trimmedTitle,
        content: trimmed,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "작성 실패");
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          aria-label="목록으로"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          <ArrowLeft size={18} weight="bold" />
        </button>
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {editing ? "글 수정" : "새 글 쓰기"}
        </h2>
      </div>

      {!editing && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {selectableCategories.map((c) => {
              const active = c === category;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  disabled={submitting}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  }`}
                >
                  {BULLETIN_CATEGORY_LABELS[c].name}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setScope("public")}
              disabled={submitting}
              className={`inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                scope === "public"
                  ? "border-zinc-800 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950"
                  : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              }`}
            >
              <Globe size={16} weight="bold" />
              전체 공개
            </button>
            <button
              type="button"
              onClick={() => {
                if (guild != null) setScope("guild");
              }}
              disabled={submitting || guild == null}
              title={guild == null ? "길드 가입 후 사용할 수 있습니다" : guild.name}
              className={`inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                scope === "guild"
                  ? "border-emerald-700 bg-emerald-600 text-white"
                  : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              }`}
            >
              <UsersThree size={16} weight="bold" />
              길드 전용
            </button>
          </div>
          {scope === "guild" && guild != null && (
            <div className="-mt-1 text-xs text-emerald-700 dark:text-emerald-300">
              {guild.name} 길드원에게만 보입니다.
            </div>
          )}
        </>
      )}

      <input
        type="text"
        value={titleDraft}
        onChange={(e) => setTitleDraft(e.target.value)}
        maxLength={BULLETIN_TITLE_MAX_LENGTH + 10}
        placeholder={`제목 (필수, 최대 ${BULLETIN_TITLE_MAX_LENGTH}자)`}
        disabled={submitting}
        required
        aria-required="true"
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-400"
      />
      <div className="-mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
        <span
          className={
            trimmedTitle.length > BULLETIN_TITLE_MAX_LENGTH
              ? "text-rose-600"
              : ""
          }
        >
          제목 {trimmedTitle.length} / {BULLETIN_TITLE_MAX_LENGTH}
        </span>
      </div>

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={14}
        autoFocus
        maxLength={BULLETIN_MAX_LENGTH + 100}
        placeholder="게시판에 남길 글을 입력하세요"
        disabled={submitting}
        className="w-full resize-y rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-400"
      />
      <div className="flex items-center justify-between text-xs">
        <span
          className={
            trimmed.length > BULLETIN_MAX_LENGTH
              ? "text-rose-600"
              : "text-zinc-500 dark:text-zinc-400"
          }
        >
          {trimmed.length} / {BULLETIN_MAX_LENGTH}
        </span>
        {err && <span className="text-rose-600">{err}</span>}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          취소
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="rounded-md border border-emerald-700 bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? (editing ? "수정 중…" : "등록 중…") : editing ? "수정" : "등록"}
        </button>
      </div>
    </div>
  );
}
