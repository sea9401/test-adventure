"use client";

import { useState } from "react";
import { SURFACE_INSET } from "@/components/ui/surfaces";

export function GameInfoReturnControl() {
  const [closeBlocked, setCloseBlocked] = useState(false);

  const returnToGame = () => {
    setCloseBlocked(false);
    window.close();
    window.setTimeout(() => {
      if (!window.closed) {
        setCloseBlocked(true);
      }
    }, 100);
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={returnToGame}
        className="inline-flex min-h-11 items-center font-semibold text-amber-700 underline underline-offset-4 dark:text-amber-300"
      >
        무슨무슨게임으로 돌아가기
      </button>
      {closeBlocked ? (
        <p
          role="status"
          className={`${SURFACE_INSET} max-w-md p-3 text-sm text-zinc-700 dark:text-zinc-300`}
        >
          브라우저가 이 탭 닫기를 차단했습니다. 기존 게임 탭을 선택해 주세요.
        </p>
      ) : null}
    </div>
  );
}
