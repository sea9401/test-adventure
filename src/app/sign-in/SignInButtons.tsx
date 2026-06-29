"use client";

import { signIn } from "next-auth/react";

export function SignInButtons() {
  return (
    <div className="flex w-full max-w-xs flex-col gap-3">
      <button
        type="button"
        onClick={() => signIn("google", { callbackUrl: "/create" })}
        className="flex items-center justify-center gap-3 rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm font-medium text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50"
      >
        <GoogleIcon />
        Google 계정으로 로그인
      </button>
      <button
        type="button"
        onClick={() => signIn("kakao", { callbackUrl: "/create" })}
        className="flex items-center justify-center gap-3 rounded-lg border border-yellow-300 bg-yellow-400 px-4 py-3 text-sm font-medium text-zinc-900 shadow-sm transition-colors hover:bg-yellow-300"
      >
        <KakaoIcon />
        카카오 계정으로 로그인
      </button>
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
