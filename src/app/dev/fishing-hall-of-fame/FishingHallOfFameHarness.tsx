"use client";

import { useState } from "react";
import { FishingHallOfFameView } from "@/adventure/v2/FishingHallOfFameView";
import {
  type FishingHallOfFameData,
  type LeaderboardRow,
  reduceAllTimeBest,
  shapeLeaderboard,
} from "@/adventure/v2/fishingLeaderboard";

function buildMock(): FishingHallOfFameData {
  const rows: LeaderboardRow[] = [
    { fishId: "crucian_carp", userId: "u1", name: "물가의달인", size: 44.2 },
    { fishId: "crucian_carp", userId: "me", name: "나그네", size: 38.0 },
    { fishId: "marlin", userId: "u2", name: "대물헌터", size: 410.5 },
    { fishId: "platinum_carp", userId: "me", name: "나그네", size: 280.1 },
    { fishId: "goldeye", userId: "u1", name: "물가의달인", size: 70.3 },
  ];
  return { byFish: shapeLeaderboard(reduceAllTimeBest(rows), "me", 10) };
}

// /dev/fishing-hall-of-fame — mock 역대 기록으로 명예의 전당 UI QA(로그인·DB 없이).
export function FishingHallOfFameHarness() {
  const [data] = useState<FishingHallOfFameData | null>(buildMock);
  return (
    <div className="space-y-3">
      <div className="mx-auto max-w-[640px] px-6 pt-4">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          DEV 하니스 — mock 역대 기록(붕어·청새치·백금 잉어·여명 금눈돔). 나=나그네.
        </div>
      </div>
      <FishingHallOfFameView data={data} loading={false} />
    </div>
  );
}
