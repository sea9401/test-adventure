"use client";

import { FiefdomView } from "@/adventure/fiefdom/FiefdomView";
import { GameProvider, type GameCtx } from "@/adventure/GameContext";

// 길드 영지(Fiefdom) 진입 화면 placeholder 단독 미리보기.
// 로그인·DB 우회용 — /dev/* 는 auth.config 에서 public, dev/layout 이 production 차단.
export default function FiefdomPreviewPage() {
  // FiefdomView 가 쓰는 컨텍스트는 back() 한 곳뿐. 나머지는 placeholder 단계라 불필요.
  const stubCtx = { back: () => {} } as unknown as GameCtx;

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4">
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <strong>DEV</strong> · 길드 영지(Fiefdom) — 본토 라우팅 안 거치고 화면만 확인.
      </div>
      <GameProvider value={stubCtx}>
        <FiefdomView />
      </GameProvider>
    </div>
  );
}
