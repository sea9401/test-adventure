"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoadErrorBanner } from "@/components/ui/LoadErrorBanner";
import { Trophy, Crown, CaretRight } from "@phosphor-icons/react";

type RankEntry = {
  rank: number;
  userId: string;
  name: string;
  level: number;
  score: number;
  isMe: boolean;
};
type RankingResp = {
  ok?: boolean;
  top?: RankEntry[];
  myRank?: number | null;
  myScore?: number;
  totalRanked?: number;
};

export function V2ArenaRankingTab() {
  const router = useRouter();
  const [data, setData] = useState<RankingResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(false);
    try {
      const res = await fetch("/api/v2/arena/ranking");
      const j = (await res.json().catch(() => null)) as RankingResp | null;
      if (j?.ok) setData(j);
      else setErr(true);
    } catch {
      setErr(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 탭 마운트 1회 fetch
    load();
  }, [load]);

  if (err) return <LoadErrorBanner onRetry={load} />;
  if (loading || !data) {
    return <div className="py-8 text-center text-sm text-zinc-500">불러오는 중...</div>;
  }

  const top = data.top ?? [];

  return (
    <section className="space-y-3">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-800/50 dark:bg-amber-950/30">
        내 순위{" "}
        <strong className="tabular-nums">
          {data.myRank != null ? `${data.myRank}위` : "기록 없음"}
        </strong>
        {data.myRank != null && (
          <span className="text-zinc-500">
            {" "}
            / {data.totalRanked}명 · {data.myScore}점
          </span>
        )}
      </div>

      {top.length === 0 ? (
        <div className="py-8 text-center text-sm text-zinc-500">
          아직 순위에 오른 모험가가 없어요. 랭크 매치를 치르면 순위에 등록됩니다.
        </div>
      ) : (
        <ul className="divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-700">
          {top.map((e) => (
            <li key={e.rank}>
              <button
                type="button"
                onClick={() => router.push(`/character/${encodeURIComponent(e.name)}`)}
                className={
                  "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60 " +
                  (e.isMe ? "bg-amber-50 dark:bg-amber-950/30" : "bg-white dark:bg-zinc-900")
                }
              >
                <span
                  className={
                    "w-7 shrink-0 text-center font-bold tabular-nums " +
                    (e.rank <= 3 ? "text-amber-500" : "text-zinc-400")
                  }
                >
                  {e.rank}
                </span>
                {e.rank === 1 ? (
                  <Crown size={16} weight="fill" className="shrink-0 text-amber-500" />
                ) : (
                  <Trophy size={14} className="shrink-0 text-zinc-300 dark:text-zinc-600" />
                )}
                <span className="min-w-0 flex-1 truncate">
                  {e.name}
                  <span className="ml-1 text-xs text-zinc-500">Lv.{e.level}</span>
                  {e.isMe && (
                    <span className="ml-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
                      (나)
                    </span>
                  )}
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{e.score}점</span>
                <CaretRight size={14} className="shrink-0 text-zinc-300 dark:text-zinc-600" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
