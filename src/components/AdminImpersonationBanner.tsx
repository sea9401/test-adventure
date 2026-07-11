"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type ActiveImpersonation = {
  targetUserId: string;
  gameName: string | null;
  email: string | null;
  expiresAt: number;
};

export function AdminImpersonationBanner() {
  const [active, setActive] = useState<ActiveImpersonation | null>(null);
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    if (!document.cookie.split("; ").includes("admin_impersonation_ui=1")) {
      return;
    }
    let cancelled = false;
    void fetch("/api/admin/impersonation", { cache: "no-store" })
      .then(async (response) =>
        response.ok
          ? ((await response.json()) as { active?: ActiveImpersonation | null })
          : null,
      )
      .then((body) => {
        if (!cancelled) setActive(body?.active ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!active) return null;

  async function endImpersonation() {
    if (ending) return;
    setEnding(true);
    try {
      const response = await fetch("/api/admin/impersonation", {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      window.location.replace("/admin?tab=users");
    } catch {
      setEnding(false);
      window.alert("계정 가장을 종료하지 못했습니다. 잠시 후 다시 시도해주세요.");
    }
  }

  return (
    <div className="sticky top-0 z-[100] border-b border-rose-700 bg-rose-600 px-3 py-2 text-white shadow-md">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-2 text-sm">
        <div className="min-w-0">
          <strong className="font-semibold">유저 계정 조작 중</strong>
          <span className="ml-2">
            {active.gameName?.trim() || "이름 없음"}
          </span>
          <span className="ml-2 hidden font-mono text-[11px] text-rose-100 sm:inline">
            {active.targetUserId}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/admin?tab=users"
            className="rounded border border-white/60 px-2 py-1 text-xs font-medium hover:bg-white/10"
          >
            관리자 페이지
          </Link>
          <button
            type="button"
            disabled={ending}
            onClick={() => void endImpersonation()}
            className="rounded bg-white px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
          >
            {ending ? "종료 중…" : "관리자로 돌아가기"}
          </button>
        </div>
      </div>
    </div>
  );
}
