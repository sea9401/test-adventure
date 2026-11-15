"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { SURFACE_CARD } from "@/components/ui/surfaces";
import { runLifeCollectAll, type LifeCollectLine } from "./lifeCollectAll";

const TONE_CLASS: Record<LifeCollectLine["tone"], string> = {
  ok: "text-zinc-800 dark:text-zinc-100",
  info: "text-zinc-600 dark:text-zinc-300",
  error: "text-rose-600 dark:text-rose-400",
};

// 홈의 "생활 한 번에 정산" — 생활 명성으로 편의가 열린 계정에만 보인다.
// 자동 채집 정산·재시작, 밭 수확·다시 심기, 목장 수거·사료 채우기를 차례로 요청하고 결과를 한 줄씩 보여 준다.
export function LifeCollectAllCard({
  onDone,
  run = runLifeCollectAll,
}: {
  onDone?: () => void;
  run?: () => Promise<LifeCollectLine[]>;
}) {
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<LifeCollectLine[] | null>(null);

  const collect = async () => {
    setBusy(true);
    try {
      setLines(await run());
    } finally {
      setBusy(false);
      onDone?.();
    }
  };

  return (
    <section className={`${SURFACE_CARD} p-3`} aria-labelledby="life-collect-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="life-collect-title" className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
            생활 한 번에 정산
          </h2>
          <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-300">
            자동 채집 정산과 재시작, 밭 수확과 다시 심기, 목장 수거와 사료 채우기를 한 번에 합니다.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          className="min-h-10 shrink-0"
          disabled={busy}
          onClick={() => void collect()}
        >
          {busy ? "정산 중..." : "한 번에 정산"}
        </Button>
      </div>
      {lines ? (
        <ul
          aria-label="정산 결과"
          className="mt-3 space-y-1 border-t border-zinc-200 pt-3 text-xs tabular-nums dark:border-zinc-700"
        >
          {lines.map((line) => (
            <li key={line.area} className={TONE_CLASS[line.tone]}>
              {line.text}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
