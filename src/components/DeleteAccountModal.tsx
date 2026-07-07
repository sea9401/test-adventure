"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Warning, X } from "@phosphor-icons/react";
import { signOut } from "next-auth/react";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";

// 회원 탈퇴 확인 모달. 본인 닉네임(없으면 "탈퇴")을 정확히 입력해야 활성화 — 실수 클릭 방어.
// 성공 시 곧바로 signOut() — 세이브가 모두 삭제됐는데 JWT 쿠키가 남아 있으면
// 다음 요청에서 빈 유저 행이 다시 생긴다.
export function DeleteAccountModal({
  gameName,
  onClose,
}: {
  gameName: string | null;
  onClose: () => void;
}) {
  const trimmedName = (gameName ?? "").trim();
  const expected = trimmedName || "탈퇴";
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEscapeKey(onClose);
  const contentRef = useRef<HTMLDivElement>(null);
  useModalA11y(contentRef);

  const canSubmit = confirm.trim() === expected && !submitting;

  const handleDelete = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: confirm.trim() }),
      });
      if (!res.ok) {
        setError("탈퇴 처리에 실패했어요. 잠시 후 다시 시도해 주세요.");
        setSubmitting(false);
        return;
      }
      await signOut({ redirectTo: "/sign-in" });
    } catch {
      setError("네트워크 오류로 탈퇴하지 못했어요.");
      setSubmitting(false);
    }
  };

  // overlay 를 body 로 portal — backdrop-filter 부모(V2TopBar 헤더) 안에서 fixed 가 헤더
  // 기준이 돼 튀어나가는 것 회피. 이 모달은 클릭 시에만 렌더(클라 only)라 SSR 안전.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-account-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onClick={submitting ? undefined : onClose}
    >
      <div
        ref={contentRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg border border-rose-200 bg-white p-5 shadow-2xl dark:border-rose-900/60 dark:bg-zinc-900"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <Warning
              size={22}
              weight="duotone"
              className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-400"
            />
            <div>
              <h2
                id="delete-account-title"
                className="text-base font-semibold text-zinc-900 dark:text-zinc-100"
              >
                회원 탈퇴
              </h2>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                계정과 모든 게임 데이터(캐릭터·인벤토리·골드·길드·거래소·랭킹·우편)가
                영구 삭제되며 복구할 수 없어요.
              </p>
            </div>
          </div>
          {!submitting && (
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="shrink-0 rounded-md p-1 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
            >
              <X size={18} weight="bold" />
            </button>
          )}
        </div>

        <label className="mt-4 block text-sm text-zinc-700 dark:text-zinc-300">
          계속하려면 {trimmedName ? "닉네임 " : ""}
          <span className="font-semibold text-rose-600 dark:text-rose-400">
            {expected}
          </span>
          {" 을(를) 그대로 입력하세요."}
          <input
            type="text"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={submitting}
            autoComplete="off"
            className="mt-1.5 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-rose-400 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </label>

        {error && (
          <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!canSubmit}
            className="flex-1 rounded-md bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "탈퇴 중…" : "영구 삭제"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
