"use client";

import { signIn } from "next-auth/react";

// 베타 동안 구글 로그인 제외 — 카카오만 노출. (구글 재도입 시 버튼/아이콘 + auth.ts·auth.config 복원)
export function SignInButtons() {
  return (
    <div className="flex w-full max-w-xs flex-col gap-3">
      <button
        type="button"
        onClick={() => signIn("kakao", { callbackUrl: "/" })}
        className="flex items-center justify-center gap-3 rounded-lg border border-yellow-300 bg-yellow-400 px-4 py-3 text-sm font-medium text-zinc-900 shadow-sm transition-colors hover:bg-yellow-300"
      >
        <KakaoIcon />
        카카오 계정으로 로그인
      </button>
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
