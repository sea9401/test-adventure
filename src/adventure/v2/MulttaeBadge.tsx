"use client";

// 낚시 물때 배지 — 현재 물때 + 지금 입질하는 특별 손님 + 다음 물때 예보.
// 결정론(서버와 동일 계산)이라 클라가 직접 multtaeAt 으로 그린다(서버 호출 0). 1초 틱으로 창 전환 자동 반영.

import { useEffect, useState } from "react";
import { multtaeForecast } from "@/adventure/data/v2/multtae";
import { FISH } from "@/adventure/data/v2/fish";

function fmtRemain(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000));
  if (m < 60) return `${m}분 뒤`;
  const h = Math.floor(m / 60);
  return `${h}시간 ${m % 60}분 뒤`;
}

export function MulttaeBadge() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const [cur, next] = multtaeForecast(now, 2);
  const c = cur.condition;
  const special = c.specialFishId ? FISH[c.specialFishId] : null;

  return (
    <div className="rounded-md border border-sky-200 bg-sky-50/60 px-2.5 py-1.5 text-xs dark:border-sky-900/60 dark:bg-sky-950/30">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">
          {c.emoji} {c.label}
        </span>
        <span className="shrink-0 text-[10px] text-zinc-400 dark:text-zinc-500">
          {next.condition.emoji} {fmtRemain(cur.endsAt - now)}
        </span>
      </div>
      {special ? (
        <div className="mt-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-300">
          지금 {special.name}가 입질한다
        </div>
      ) : (
        <div className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
          {c.description}
        </div>
      )}
    </div>
  );
}
