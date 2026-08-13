"use client";

import { signIn } from "next-auth/react";
import { useState, type FormEvent } from "react";

export function SignInButtons() {
  const [passwordLoginError, setPasswordLoginError] = useState<string | null>(
    null,
  );
  const [passwordLoginPending, setPasswordLoginPending] = useState(false);

  async function submitPasswordLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passwordLoginPending) return;

    const formData = new FormData(event.currentTarget);
    const loginId = formData.get("loginId");
    const password = formData.get("password");
    if (typeof loginId !== "string" || typeof password !== "string") return;

    setPasswordLoginError(null);
    setPasswordLoginPending(true);
    try {
      const result = await signIn("review-credentials", {
        loginId,
        password,
        redirect: false,
        redirectTo: "/",
      });
      if (!result.ok || result.error || !result.url) {
        setPasswordLoginError("아이디 또는 비밀번호를 확인해 주세요.");
        return;
      }
      window.location.assign(result.url);
    } catch {
      setPasswordLoginError("로그인할 수 없습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setPasswordLoginPending(false);
    }
  }

  return (
    <div className="flex w-full max-w-xs flex-col gap-3">
      <button
        type="button"
        onClick={() => signIn("kakao", { callbackUrl: "/create" })}
        className="flex items-center justify-center gap-3 rounded-lg border border-yellow-300 bg-yellow-400 px-4 py-3 text-sm font-medium text-zinc-900 shadow-sm transition-colors hover:bg-yellow-300"
      >
        <KakaoIcon />
        카카오톡으로 로그인
      </button>

      <details className="group mt-1 border-t border-white/10 pt-2 text-left">
        <summary className="cursor-pointer list-none text-center text-xs text-zinc-400 transition-colors hover:text-zinc-200 [&::-webkit-details-marker]:hidden">
          아이디·비밀번호로 로그인
          <span
            aria-hidden
            className="ml-1 inline-block transition-transform group-open:rotate-180"
          >
            ▾
          </span>
        </summary>
        <form className="mt-3 space-y-2" onSubmit={submitPasswordLogin}>
          <div className="grid grid-cols-2 gap-2">
            <label className="sr-only" htmlFor="review-login-id">
              아이디
            </label>
            <input
              id="review-login-id"
              name="loginId"
              type="text"
              required
              minLength={3}
              maxLength={32}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="아이디"
              className="min-w-0 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-amber-400"
            />
            <label className="sr-only" htmlFor="review-login-password">
              비밀번호
            </label>
            <input
              id="review-login-password"
              name="password"
              type="password"
              required
              minLength={6}
              maxLength={128}
              autoComplete="current-password"
              placeholder="비밀번호"
              className="min-w-0 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-amber-400"
            />
          </div>
          <button
            type="submit"
            disabled={passwordLoginPending}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-800 disabled:cursor-wait disabled:opacity-60"
          >
            {passwordLoginPending ? "로그인 중..." : "로그인"}
          </button>
          {passwordLoginError && (
            <p
              role="alert"
              className="text-center text-[11px] text-rose-400"
            >
              {passwordLoginError}
            </p>
          )}
          <p className="text-[10px] leading-relaxed text-zinc-400">
            아이디·비밀번호 계정은 카카오 이용이 어려운 해외 이용자에게
            운영자가 개별 발급합니다. 직접 회원가입은 지원하지 않습니다.
          </p>
        </form>
      </details>
    </div>
  );
}

function KakaoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#3C1E1E"
        d="M12 3C6.477 3 2 6.582 2 11c0 2.79 1.708 5.245 4.305 6.754L5.25 21l4.172-2.252C10.21 18.91 11.09 19 12 19c5.523 0 10-3.582 10-8s-4.477-8-10-8z"
      />
    </svg>
  );
}
