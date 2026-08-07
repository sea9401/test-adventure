"use client";

import { useEffect } from "react";
import { SURFACE_ACCENT, SURFACE_CARD } from "@/components/ui/surfaces";

export type ReferralStatus = "accepted" | "invalid";

export function urlWithoutReferralParam(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.searchParams.delete("referral");
  return `${url.pathname}${url.search}${url.hash}`;
}

export function ReferralStatusNotice({ status }: { status: ReferralStatus }) {
  useEffect(() => {
    if (!new URL(window.location.href).searchParams.has("referral")) return;
    window.history.replaceState(
      null,
      "",
      urlWithoutReferralParam(window.location.href),
    );
  }, []);

  return (
    <p
      role="status"
      className={`w-full max-w-xs px-4 py-3 text-sm leading-relaxed ${
        status === "accepted"
          ? `${SURFACE_ACCENT} text-amber-900 dark:text-amber-100`
          : `${SURFACE_CARD} border-rose-300 text-rose-800 dark:border-rose-900/70 dark:text-rose-200`
      }`}
    >
      {status === "accepted"
        ? "홍보 링크가 적용되었습니다. 캐릭터를 만들면 나와 홍보자 모두 회복약 2개를 받고, 사냥터 개척 진행도에 따라 홍보자에게 추가 보상이 지급됩니다."
        : "유효하지 않거나 종료된 홍보 링크입니다."}
    </p>
  );
}
