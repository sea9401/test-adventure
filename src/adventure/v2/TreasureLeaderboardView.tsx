"use client";

import { Card } from "@/components/ui/Card";
import { TREASURE_SELL_GOLD_MULT } from "@/adventure/data/v2/antique";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { TreasureSubTabs } from "./TreasureSubTabs";
import { PlayerNameLink } from "@/components/ui/PlayerNameLink";
import type { TreasureLeaderboardData } from "./treasureLeaderboard";

// 주간 발굴가치 리더보드 표시(단일 랭킹). 데이터는 주입(useTreasureLeaderboard 실 API / dev mock).
// 설계: docs/treasure-hunt-plan.md §7

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

function rankLabel(rank: number): string {
  return MEDAL[rank] ?? `${rank}위`;
}

function endsInLabel(endsAt: string): string {
  const end = new Date(endsAt).getTime();
  if (!Number.isFinite(end)) return "";
  const ms = end - Date.now();
  if (ms <= 0) return "곧 마감";
  const days = Math.floor(ms / (24 * 3600 * 1000));
  const hours = Math.floor((ms % (24 * 3600 * 1000)) / (3600 * 1000));
  if (days > 0) return `${days}일 ${hours}시간 남음`;
  return `${hours}시간 남음`;
}

export function TreasureLeaderboardView({
  data,
  loading,
  error,
  onBack,
  onOpenDig,
  onOpenCollection,
}: {
  data: TreasureLeaderboardData | null;
  loading: boolean;
  error?: string | null;
  onBack?: () => void;
  // 발굴 서브 탭바(발굴/보관함) — 미전달(dev 하니스)이면 그 탭 숨김.
  onOpenDig?: () => void;
  onOpenCollection?: () => void;
}) {
  return (
    <main className="mx-auto max-w-[560px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader
        title="주간 발굴가치 대회"
        onBack={onBack}
        right={
          <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
            🪙 {(data?.myCoins ?? 0).toLocaleString()}
          </span>
        }
      />
      <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
        이번 주 발굴한 골동품의 감정 판매가(골드) 합계로 순위. 상위권은 발굴 코인을 받는다.
        {data?.endsAt ? ` (${endsInLabel(data.endsAt)})` : ""}
      </p>

      <TreasureSubTabs
        active="leaderboard"
        onOpenDig={onOpenDig}
        onOpenCollection={onOpenCollection}
      />

      {loading ? (
        <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
          불러오는 중…
        </p>
      ) : error ? (
        <p className="py-8 text-center text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : !data || data.entries.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
          아직 이번 주 발굴 기록이 없습니다. 발굴 감정소에서 첫 골동품을 캐보세요.
        </p>
      ) : (
        <Card padding="none" className="overflow-hidden">
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {data.entries.map((e) => (
              <li
                key={`${e.rank}-${e.name}-${e.value}`}
                className={`flex items-center justify-between gap-3 px-3 py-2.5 ${
                  e.isMe ? "bg-amber-50 dark:bg-amber-950/30" : ""
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="w-9 shrink-0 text-center text-sm font-bold tabular-nums">
                    {rankLabel(e.rank)}
                  </span>
                  <span className="truncate text-sm font-medium">
                    <PlayerNameLink name={e.name} />
                    {e.isMe && (
                      <span className="ml-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                        나
                      </span>
                    )}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-medium tabular-nums text-amber-600 dark:text-amber-400">
                  {(e.value * TREASURE_SELL_GOLD_MULT).toLocaleString()}골드
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </main>
  );
}
