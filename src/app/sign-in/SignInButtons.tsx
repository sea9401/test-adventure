"use client";

import { signIn } from "next-auth/react";
import { useState, type FormEvent } from "react";

export function SignInButtons() {
  const [reviewLoginError, setReviewLoginError] = useState<string | null>(null);
  const [reviewLoginPending, setReviewLoginPending] = useState(false);

  async function submitReviewLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reviewLoginPending) return;

    const formData = new FormData(event.currentTarget);
    const loginId = formData.get("loginId");
    const password = formData.get("password");
    if (typeof loginId !== "string" || typeof password !== "string") return;

    setReviewLoginError(null);
    setReviewLoginPending(true);
    try {
      const result = await signIn("review-credentials", {
        loginId,
        password,
        redirect: false,
        redirectTo: "/",
      });
      if (!result.ok || result.error || !result.url) {
        setReviewLoginError("아이디 또는 비밀번호를 확인해 주세요.");
        return;
      }
      window.location.assign(result.url);
    } catch {
      setReviewLoginError("로그인할 수 없습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setReviewLoginPending(false);
    }
  }

  return (
    <div className="flex w-full max-w-xs flex-col gap-3">
      <button
        type="button"
        onClick={() => signIn("google", { callbackUrl: "/create" })}
        className="flex items-center justify-center gap-3 rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm font-medium text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50"
      >
        <GoogleIcon />
        Google 계정으로 로그인 (기존 회원)
      </button>
      <button
        type="button"
        onClick={() => signIn("kakao", { callbackUrl: "/create" })}
        className="flex items-center justify-center gap-3 rounded-lg border border-yellow-300 bg-yellow-400 px-4 py-3 text-sm font-medium text-zinc-900 shadow-sm transition-colors hover:bg-yellow-300"
      >
        <KakaoIcon />
        카카오톡으로 로그인
      </button>

      <details className="group mt-1 border-t border-white/10 pt-2 text-left">
        <summary className="cursor-pointer list-none text-center text-xs text-zinc-500 transition-colors hover:text-zinc-300 [&::-webkit-details-marker]:hidden">
          아이디·비밀번호로 로그인
          <span
            aria-hidden
            className="ml-1 inline-block transition-transform group-open:rotate-180"
          >
            ▾
          </span>
        </summary>
        <form className="mt-3 space-y-2" onSubmit={submitReviewLogin}>
          <div className="grid grid-cols-2 gap-2">
            <label className="sr-only" htmlFor="review-login-id">
              아이디
            </label>
            <input
              id="review-login-id"
              name="loginId"
              type="text"
              required
              maxLength={128}
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
              maxLength={256}
              autoComplete="current-password"
              placeholder="비밀번호"
              className="min-w-0 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-amber-400"
            />
          </div>
          <button
            type="submit"
            disabled={reviewLoginPending}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-800 disabled:cursor-wait disabled:opacity-60"
          >
            {reviewLoginPending ? "로그인 중..." : "로그인"}
          </button>
          {reviewLoginError && (
            <p
              role="alert"
              className="text-center text-[11px] text-rose-400"
            >
              {reviewLoginError}
            </p>
          )}
          <p className="text-[10px] leading-relaxed text-zinc-600">
            아이디/비밀번호로는 회원가입할 수 없습니다. 회원 가입은 카카오톡
            계정으로만 가능합니다.{" "}
            <a
              href="https://msmsgr.com/sign-in"
              className="underline decoration-zinc-700 underline-offset-2 hover:text-zinc-400"
            >
              https://msmsgr.com/sign-in
            </a>{" "}
            페이지에서 &apos;카카오톡으로 로그인&apos; 버튼을 통해 진행해주세요.
          </p>
        </form>
      </details>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.204c0-.638-.057-1.252-.164-1.84H9v3.48h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.91c1.702-1.568 2.682-3.876 2.682-6.614z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.182l-2.91-2.258c-.806.54-1.837.86-3.046.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.998 8.998 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.709A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.709V4.959H.957A8.998 8.998 0 0 0 0 9c0 1.452.348 2.827.957 4.041l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.582C13.463.891 11.426 0 9 0A8.998 8.998 0 0 0 .957 4.959l3.007 2.332C4.672 5.164 6.656 3.58 9 3.58z"
      />
    </svg>
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
