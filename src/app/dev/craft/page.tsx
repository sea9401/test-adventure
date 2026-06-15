"use client";

import { V2CraftView } from "@/adventure/v2/V2CraftView";
import { GameStateProvider } from "@/adventure/v2/GameStateProvider";

// 대장간(제작) UI 프리뷰 — 레시피 카드 레이아웃 QA. 레시피는 정적 카탈로그(V2_RECIPES)라
// 로그인/DB 없이도 렌더된다(골드·보유 재료 0이라 재료 칩은 전부 부족 표시, 제작 버튼 비활성).
// V2CraftView 가 useGameState(은행우선 게이트)를 쓰므로 GameStateProvider 로 감싼다(기본값=골드 0).
export default function CraftPreview() {
  return (
    <GameStateProvider>
      <div className="mx-auto max-w-2xl p-2">
        <div className="m-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <strong>DEV</strong> · 대장간 — 레시피 카드(재료 보유/필요·골드) 레이아웃 QA.
          부위 탭 전환. 재료·골드 0이라 제작 버튼은 비활성.
        </div>
        <V2CraftView onBack={() => {}} />
      </div>
    </GameStateProvider>
  );
}
