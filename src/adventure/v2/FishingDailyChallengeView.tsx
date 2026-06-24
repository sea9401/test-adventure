"use client";

import { useState } from "react";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { FishingSubTabs } from "./FishingSubTabs";
import type {
  ClaimResult,
  FishingChallengesState,
} from "./useFishingDailyChallenge";

function fmtRemain(nextResetAt: number): string {
  const ms = nextResetAt - Date.now();
  const m = Math.max(0, Math.floor(ms / 60_000));
  if (m < 60) return `${m}분 뒤 초기화`;
  const h = Math.floor(m / 60);
  return `${h}시간 ${m % 60}분 뒤 초기화`;
}

// 오늘의 낚시 도전 — 순수 표현. 데이터·핸들러는 주입(FishingDailyChallengePanel).
export function FishingDailyChallengeView({
  state,
  loading,
  error,
  claiming,
  onClaim,
  onBack,
  onOpenFishing,
  onOpenLeaderboard,
  onOpenHallOfFame,
  onOpenShop,
}: {
  state: FishingChallengesState | null;
  loading: boolean;
  error?: string | null;
  claiming?: string | null;
  onClaim?: (id: string) => Promise<ClaimResult>;
  onBack?: () => void;
  // 낚시터 서브 탭바 — 미전달(dev 하니스)이면 그 탭 숨김.
  onOpenFishing?: () => void;
  onOpenLeaderboard?: () => void;
  onOpenHallOfFame?: () => void;
  onOpenShop?: () => void;
}) {
  const [msg, setMsg] = useState<string | null>(null);

  const handleClaim = async (id: string) => {
    if (!onClaim) return;
    const r = await onClaim(id);
    setMsg(r.message);
  };

  return (
    <main className="mx-auto my-4 w-[calc(100%-2rem)] max-w-[520px] space-y-4 rounded-2xl border border-zinc-200 bg-white/90 p-6 shadow-lg backdrop-blur-md text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/90 dark:text-zinc-100">
      <SubViewHeader
        title="오늘의 낚시 도전"
        onBack={onBack}
        right={
          state ? (
            <span className="shrink-0 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
              낚시 코인 {state.coins}
            </span>
          ) : undefined
        }
      />

      <FishingSubTabs
        active="challenges"
        onOpenFishing={onOpenFishing}
        onOpenLeaderboard={onOpenLeaderboard}
        onOpenHallOfFame={onOpenHallOfFame}
        onOpenShop={onOpenShop}
      />

      {loading && (
        <p className="py-6 text-center text-sm text-zinc-400">불러오는 중…</p>
      )}
      {error && !loading && (
        <p className="py-6 text-center text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}

      {state && !loading && (
        <>
          <p className="text-center text-[11px] text-zinc-400 dark:text-zinc-500">
            매일 새로 열립니다. {fmtRemain(state.nextResetAt)}
          </p>

          <ul className="space-y-2.5">
            {state.challenges.map((c) => (
              <li
                key={c.id}
                className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{c.title}</div>
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      {c.desc}
                    </div>
                  </div>
                  <span className="shrink-0 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                    코인 {c.rewardCoins}
                  </span>
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-sky-500 transition-[width]"
                      style={{
                        width: `${Math.round((c.progress / c.goal) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="shrink-0 text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
                    {c.progress}/{c.goal}
                  </span>
                  {c.claimed ? (
                    <span className="shrink-0 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                      수령 완료
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={!c.claimable || claiming === c.id}
                      onClick={() => handleClaim(c.id)}
                      className="shrink-0 rounded-full bg-amber-500 px-3 py-1 text-[11px] font-semibold text-white transition enabled:hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-600"
                    >
                      {claiming === c.id ? "수령 중" : "수령"}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {msg && (
            <p className="text-center text-xs text-zinc-600 dark:text-zinc-300">
              {msg}
            </p>
          )}
        </>
      )}
    </main>
  );
}
