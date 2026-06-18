"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";

// 수집 칭호 상점(A 메타 — 소비형 수집 포인트 sink). 수집 포인트로 비파워 prestige 칭호 구매.
//   자체 fetch(직업 도감 안에서 렌더). 포인트 풀은 프리셋 슬롯과 공유 — 구매 시 잔액 차감.
//   순수 비파워(파워 무관 칭호 표기) — 거쳐온 직업/모은 패시브의 상징.

type ShopTitle = {
  id: string;
  name: string;
  description: string;
  cost: number;
  owned: boolean;
};
type ShopState = {
  titles: ShopTitle[];
  collectionPoints: number;
  collectionPointsSpent: number;
  collectionPointsAvailable: number;
};

export function V2CollectionTitleShop() {
  const [state, setState] = useState<ShopState | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/v2/me/collection-title");
      const j = (await res.json().catch(() => null)) as
        | (ShopState & { ok?: boolean })
        | null;
      if (j?.ok) setState(j);
    } catch {
      // 무시 — 패널 미표시.
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (!state) return null;

  async function buy(titleId: string, cost: number) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v2/me/collection-title", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "buy", titleId }),
      });
      const j = (await res.json().catch(() => null)) as
        | (ShopState & { ok?: boolean; error?: string; need?: number })
        | null;
      if (j?.ok) setState(j);
      else if (j?.error === "insufficient_points")
        setMsg(`수집 포인트가 부족해요 (필요 ${j.need ?? cost})`);
      else if (j?.error === "already_owned") setMsg("이미 보유한 칭호예요.");
      else setMsg("칭호를 살 수 없어요");
    } catch {
      setMsg("오류가 발생했어요");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card padding="md">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">수집 칭호 상점</h2>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          수집 포인트 잔액{" "}
          <strong className="tabular-nums text-teal-700 dark:text-teal-400">
            {state.collectionPointsAvailable}
          </strong>
        </span>
      </div>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        모은 수집 포인트로 칭호를 얻습니다. 순수 표기용(파워 무관)이고, 등급은
        떨어지지 않아요. 프리셋 슬롯과 같은 포인트를 나눠 씁니다.
      </p>

      <ul className="mt-3 space-y-1.5">
        {state.titles.map((t) => {
          const affordable =
            t.owned || state.collectionPointsAvailable >= t.cost;
          return (
            <li
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-semibold">{t.name}</span>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {t.description}
                </span>
              </div>
              {t.owned ? (
                <span className="shrink-0 rounded-md bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                  보유
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => buy(t.id, t.cost)}
                  disabled={busy || !affordable}
                  className="shrink-0 rounded-md border border-teal-600 bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  구매 (수집 포인트 {t.cost})
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {msg && (
        <div
          role="status"
          aria-live="polite"
          className="mt-2 rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs text-rose-700 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-300"
        >
          {msg}
        </div>
      )}
    </Card>
  );
}
