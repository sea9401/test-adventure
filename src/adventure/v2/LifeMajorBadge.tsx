"use client";

import { useEffect, useState } from "react";
import { Medal } from "@phosphor-icons/react";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import type { LifeMajorActivity, LifeMajorView } from "./lifeMajor";
import { fetchLifeMajorView } from "./lifeMajorClient";

// 생활 활동 화면 상단 한 줄 — 이 생활이 전공이면 역할·명장 단계·효과를 알린다.
export function LifeMajorBadge({ activity }: { activity: LifeMajorActivity }) {
  const [view, setView] = useState<LifeMajorView | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchLifeMajorView().then((next) => {
      if (!cancelled) setView(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const entry = view?.activities.find((item) => item.id === activity);
  if (!entry?.role) return null;
  return (
    <div className={`${SURFACE_INSET} flex min-h-10 items-center gap-2 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-200`}>
      <Medal size={18} weight="duotone" className="shrink-0 text-amber-500" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="font-semibold">
          {entry.role === "major" ? "주전공" : "부전공"} · 명장 {entry.stage}단계
        </span>
        {entry.effectText ? (
          <span className="text-zinc-500 dark:text-zinc-400"> · {entry.effectText}</span>
        ) : null}
      </span>
    </div>
  );
}
