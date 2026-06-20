"use client";

import { FishingHallOfFameView } from "./FishingHallOfFameView";
import { useFishingHallOfFame } from "./useFishingHallOfFame";

// 역대 최대어 명예의 전당 패널 — 마운트 시 fetch(useFishingHallOfFame) 후 뷰에 주입.
export function FishingHallOfFamePanel({ onBack }: { onBack: () => void }) {
  const { data, loading, error } = useFishingHallOfFame();
  return (
    <FishingHallOfFameView
      data={data}
      loading={loading}
      error={error}
      onBack={onBack}
    />
  );
}
