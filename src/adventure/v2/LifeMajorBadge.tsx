"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Medal } from "@phosphor-icons/react";
import { buttonClassName } from "@/components/ui/Button";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import type { LifeMajorActivity, LifeMajorView } from "./lifeMajor";
import { fetchLifeMajorView } from "./lifeMajorClient";

const ROW_CLASS = `${SURFACE_INSET} flex min-h-10 items-center gap-2 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-200`;

// 생활 활동 화면 상단 한 줄 — 이 생활이 전공이면 역할·명장 단계·효과를 알리고,
// Lv.100 인데 전공 칸이 비어 있으면 고를 수 있다는 것과 고르는 곳을 알린다.
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
  if (!view || !entry) return null;

  if (entry.role) {
    return (
      <div className={ROW_CLASS}>
        <Medal size={18} weight="duotone" className="shrink-0 text-amber-500" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="font-semibold">
            {entry.role === "major" ? "주전공" : "부전공"} · 명장 {entry.stage}단계
            {entry.capped ? ` · 거장 ${entry.grandGrade.toLocaleString("ko-KR")}등급` : ""}
          </span>
          {entry.effectText ? (
            <span className="text-zinc-500 dark:text-zinc-400"> · {entry.effectText}</span>
          ) : null}
        </span>
      </div>
    );
  }

  // 두 칸이 다 찼으면 바꿀지 말지는 플레이어가 이미 정한 것이라 다시 권하지 않는다.
  const openSlot = view.major === null ? "주전공" : view.minor === null ? "부전공" : null;
  if (!entry.eligible || openSlot === null) return null;
  return (
    <div className={ROW_CLASS}>
      <Medal size={18} weight="duotone" className="shrink-0 text-amber-500" aria-hidden />
      <span className="min-w-0 flex-1 font-semibold">
        Lv.100 달성 · {openSlot}으로 고를 수 있습니다
      </span>
      <Link
        href="/character/life"
        className={buttonClassName({ variant: "secondary", size: "sm", className: "shrink-0" })}
      >
        전공 고르기
      </Link>
    </div>
  );
}
