"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Compass, Gift, CaretRight } from "@phosphor-icons/react";
import type { QuestView } from "@/adventure/data/v2/v2Quests";

// 홈 상단 배너 — 지금 향할 "현재 목표" 하나를 안내(가이드 퀘스트). 전부 끝났으면 렌더 안 함.
//   클릭 → /quests(성장 안내 패널). 수령 가능하면 "받기" 뱃지로 표시.
export function GuideQuestBanner() {
  const router = useRouter();
  const [current, setCurrent] = useState<QuestView | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/v2/me/quests")
      .then((r) => r.json())
      .then((j: { ok?: boolean; current?: QuestView | null } | null) => {
        if (alive && j?.ok) setCurrent(j.current ?? null);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!loaded || !current) return null;
  const claimable = current.status === "claimable";

  return (
    <button
      type="button"
      onClick={() => router.push("/quests")}
      className={`flex w-full items-center gap-3 rounded-md border px-4 py-3 text-left transition ${
        claimable
          ? "border-amber-300 bg-amber-50 hover:bg-amber-100 dark:border-amber-700/60 dark:bg-amber-950/40 dark:hover:bg-amber-950/60"
          : "border-emerald-300 bg-emerald-50 hover:bg-emerald-100 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/50"
      }`}
    >
      {claimable ? (
        <Gift size={20} weight="fill" className="shrink-0 text-amber-500" />
      ) : (
        <Compass size={20} weight="fill" className="shrink-0 text-emerald-500" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            퀘스트
          </span>
          {claimable && (
            <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
              보상 받기
            </span>
          )}
        </div>
        <p className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          {current.title}
        </p>
        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
          {claimable ? "완료 — 보상을 받으세요" : current.desc}
        </p>
      </div>
      <CaretRight
        size={16}
        className="shrink-0 text-zinc-400 dark:text-zinc-600"
      />
    </button>
  );
}
