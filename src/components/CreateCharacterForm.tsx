"use client";

import { useEffect, useState } from "react";
import { CheckCircle, WarningCircle } from "@phosphor-icons/react";
import type {
  SubmitOptions,
  SubmitResult,
} from "@/adventure/profile/useProfile";
import type { Avatar } from "@/adventure/profile/avatars";
import {
  AvatarPicker,
  type AvatarCategory,
} from "@/adventure/profile/AvatarPicker";

const NAME_MIN = 1;
const NAME_MAX = 16;
const CHECK_DEBOUNCE_MS = 400;

type CheckState =
  | { kind: "idle" }
  | { kind: "tooLong" }
  | { kind: "checking" }
  | { kind: "available" }
  | { kind: "taken" }
  | { kind: "error" };

// 캐릭터 생성 폼 — 이름 + 외형. 모달 chrome 없이 순수 폼만 담당하므로
// /create 페이지든 다른 컨테이너든 재사용 가능. 제출 성공 시 onSuccess() 콜백.
export function CreateCharacterForm({
  onSubmit,
  onSuccess,
}: {
  onSubmit: (
    data: { name: string; gender: Avatar },
    options?: SubmitOptions,
  ) => Promise<SubmitResult>;
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<Avatar | null>(null);
  const [category, setCategory] = useState<AvatarCategory>("character");
  const [check, setCheck] = useState<CheckState>({ kind: "idle" });
  const [submitting, setSubmitting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const trimmed = name.trim();

  // 입력 변경 시 debounce 후 가용성 체크. 컴포넌트 unmount/입력 변경 시 fetch 결과는 무시.
  // 외부 입력(name)을 관찰해 check 상태로 매핑 — 의도적 set-state-in-effect.
  useEffect(() => {
    if (trimmed.length < NAME_MIN) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCheck({ kind: "idle" });
      return;
    }
    if (trimmed.length > NAME_MAX) {
      setCheck({ kind: "tooLong" });
      return;
    }
    setCheck({ kind: "checking" });
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/profile/check-name?name=${encodeURIComponent(trimmed)}`,
        );
        if (cancelled) return;
        if (!res.ok) {
          setCheck({ kind: "error" });
          return;
        }
        const data = (await res.json()) as { available: boolean };
        setCheck({ kind: data.available ? "available" : "taken" });
      } catch {
        if (!cancelled) setCheck({ kind: "error" });
      }
    }, CHECK_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [trimmed]);

  const canSubmit =
    avatar !== null && check.kind === "available" && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || avatar === null) return;
    setSubmitting(true);
    setRetrying(false);
    setSubmitError(null);
    const result = await onSubmit(
      { name: trimmed, gender: avatar },
      { onRetry: () => setRetrying(true) },
    );
    if (result.ok) {
      onSuccess();
      return;
    }
    setSubmitting(false);
    setRetrying(false);
    if (result.reason === "taken") {
      setCheck({ kind: "taken" });
      setSubmitError("이미 사용 중인 이름이에요. 다른 이름으로 시도해주세요.");
    } else if (result.reason === "invalid") {
      setSubmitError("입력값이 유효하지 않아요.");
    } else if (result.reason === "network") {
      setSubmitError(
        "네트워크가 불안정해요. 연결을 확인하고 다시 시도해주세요.",
      );
    } else {
      // server (5xx)
      setSubmitError("서버가 응답하지 않아요. 잠시 후 다시 시도해주세요.");
    }
  };

  return (
    <div>
      <h1 className="text-xl font-semibold">모험가를 만들어보세요</h1>
      <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
        이름과 외형을 골라 새로운 모험을 시작합니다.
      </p>
      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <div>
          <label className="mb-1.5 block text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            이름
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="이름 입력"
            maxLength={NAME_MAX}
            autoFocus
            disabled={submitting}
            className="ui-form-input w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-base outline-none transition-colors focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-400"
          />
          <NameCheckIndicator state={check} />
        </div>
        <div>
          <div className="mb-1.5 text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            외형
          </div>
          <AvatarPicker
            category={category}
            onCategoryChange={setCategory}
            selected={avatar}
            onSelect={setAvatar}
          />
        </div>
        {submitError && (
          <p className="text-sm text-rose-600 dark:text-rose-400">
            {submitError}
          </p>
        )}
        <button
          type="submit"
          disabled={!canSubmit}
          className="ui-lift-card w-full rounded-md bg-zinc-900 px-3 py-2 text-base font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {submitting
            ? retrying
              ? "재시도 중..."
              : "저장 중..."
            : "모험 시작"}
        </button>
      </form>
    </div>
  );
}

function NameCheckIndicator({ state }: { state: CheckState }) {
  if (state.kind === "idle") {
    return (
      <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
        1~16자, 다른 모험가와 겹치지 않는 이름으로 정해주세요.
      </p>
    );
  }
  if (state.kind === "tooLong") {
    return (
      <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
        1~16자로 입력해주세요.
      </p>
    );
  }
  if (state.kind === "checking") {
    return (
      <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
        확인 중...
      </p>
    );
  }
  if (state.kind === "available") {
    return (
      <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
        <CheckCircle size={14} weight="fill" />
        사용 가능한 이름이에요.
      </p>
    );
  }
  if (state.kind === "taken") {
    return (
      <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400">
        <WarningCircle size={14} weight="fill" />
        이미 사용 중인 이름이에요.
      </p>
    );
  }
  return (
    <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
      <WarningCircle size={14} weight="fill" />
      확인하지 못했어요. 잠시 후 다시 시도해주세요.
    </p>
  );
}
