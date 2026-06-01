"use client";

import { TreasureDigView } from "./TreasureDigView";
import { useTreasure } from "./useTreasure";

// 발굴 감정소 패널 — 실 API 핸들러(useTreasure)를 TreasureDigView 에 주입. V2GameFlow 마을 탭.
export function TreasurePanel({
  onBack,
  onOpenCollection,
}: {
  onBack: () => void;
  onOpenCollection: () => void;
}) {
  const handlers = useTreasure();
  return (
    <TreasureDigView
      {...handlers}
      onBack={onBack}
      onOpenCollection={onOpenCollection}
    />
  );
}
