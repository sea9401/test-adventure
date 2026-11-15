"use client";

import { useContext, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SURFACE_ACCENT } from "@/components/ui/surfaces";
import { GameResourceContext } from "./GameResourceContext";
import { useOptionalRefreshGameState } from "./GameStateRefreshContext";
import { STAMINA_POTION_RESTORE } from "./staminaPotions";

/** 한 번에 쓰는 버튼의 최대 수량. 더 많이 쓰려면 스태미나 바의 + 버튼으로 개수를 고른다. */
const BULK_USE_LIMIT = 10;

// 스태미나가 바닥나 사냥할 수 없을 때, 가진 스태미나 회복약을 그 자리에서 쓰게 한다.
// 회복약이 없으면 그리지 않는다(회복 시간은 화면 위 스태미나 바가 알려 준다).
export function LowStaminaPotionPrompt() {
  const potions = useContext(GameResourceContext)?.staminaPotions ?? 0;
  const refreshGameState = useOptionalRefreshGameState();
  const [busyCount, setBusyCount] = useState<number | null>(null);

  if (potions <= 0) return null;

  const use = async (count: number) => {
    setBusyCount(count);
    try {
      await fetch("/api/v2/me/use-stamina-potion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ count }),
      });
    } catch {
      // 실패해도 아래에서 서버 상태를 다시 읽어 화면을 맞춘다.
    }
    await refreshGameState?.();
    setBusyCount(null);
  };

  const bulk = Math.min(potions, BULK_USE_LIMIT);

  return (
    <section aria-label="스태미나 회복약 사용" className={`${SURFACE_ACCENT} flex flex-wrap items-center gap-x-3 gap-y-2 p-3`}>
      <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
        <h3 className="font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
          스태미나 회복약 {potions.toLocaleString("ko-KR")}개 보유
        </h3>
        <p className="text-sm tabular-nums text-zinc-700 dark:text-zinc-200">
          1개를 쓰면 스태미너 {STAMINA_POTION_RESTORE.toLocaleString("ko-KR")}을 회복합니다.
        </p>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <Button
          className="min-h-10"
          loading={busyCount === 1}
          disabled={busyCount !== null}
          onClick={() => void use(1)}
        >
          1개 사용
        </Button>
        {bulk > 1 ? (
          <Button
            variant="ghost"
            className="min-h-10"
            loading={busyCount === bulk}
            disabled={busyCount !== null}
            onClick={() => void use(bulk)}
          >
            {bulk}개 사용
          </Button>
        ) : null}
      </div>
    </section>
  );
}
