"use client";

import { V2DungeonList } from "@/adventure/v2/V2DungeonList";

// 사냥터 목록 미리보기 — 지역 그림 카드와 열린 사냥터 머리 그림을 로그인 없이 확인.
export default function HuntingGroundsPreviewPage() {
  const noop = () => undefined;
  return (
    <div className="space-y-2 pb-10">
      <V2DungeonList
        frontierDepth={30}
        playerLevel={80}
        playerLevelCap={100}
        playerJobTier={2}
        onSelectFloor={noop}
        onBack={noop}
      />
      <V2DungeonList
        frontierDepth={30}
        initialOpenDepth={7}
        playerLevel={80}
        playerLevelCap={100}
        playerJobTier={2}
        onSelectFloor={noop}
        onBack={noop}
      />
    </div>
  );
}
