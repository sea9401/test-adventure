"use client";

import { useState } from "react";
import { FishingLeaderboardView } from "@/adventure/v2/FishingLeaderboardView";
import {
  shapeLeaderboard,
  type FishingLeaderboardData,
  type LeaderboardRow,
} from "@/adventure/v2/fishingLeaderboard";

// /dev/fishing-leaderboard — mock 데이터로 종별 순위 레이아웃 QA(로그인·DB 없이).
// 데이터는 mount 후 주입(실 훅 패턴과 동일 — SSR 카운트다운 불일치 회피).

const NAMES = [
  "강태공",
  "은비늘",
  "윤슬",
  "바다",
  "소금",
  "미끼",
  "파도",
  "그림자",
  "초보",
  "노을",
  "물비늘",
  "여울",
];

function buildMock(): FishingLeaderboardData {
  const rows: LeaderboardRow[] = [];
  // 흔함 붕어 — 12명 + 본인 13위(top 밖이어도 노출되는지).
  for (let i = 0; i < 12; i += 1) {
    rows.push({
      fishId: "crucian_carp",
      userId: `u${i}`,
      name: NAMES[i % NAMES.length],
      size: 44 - i * 2.5,
    });
  }
  rows.push({ fishId: "crucian_carp", userId: "me", name: "나", size: 8.4 });
  // 영웅 청새치 — 본인 1위.
  rows.push({ fishId: "marlin", userId: "me", name: "나", size: 421.3 });
  rows.push({ fishId: "marlin", userId: "u1", name: "강태공", size: 305 });
  rows.push({ fishId: "marlin", userId: "u2", name: "바다", size: 248.6 });
  // 전설 리바이어던 — 단 한 명.
  rows.push({
    fishId: "abyssal_leviathan",
    userId: "u3",
    name: "심해왕",
    size: 980.5,
  });

  // 종별 사이즈 내림차순 — shapeLeaderboard 전제.
  rows.sort((a, b) =>
    a.fishId === b.fishId ? b.size - a.size : a.fishId.localeCompare(b.fishId),
  );

  return {
    seasonId: "2026-W23",
    // dev mock 은 카운트다운 생략(""→뷰가 숨김) — Date.now 의존 제거로 SSR 불일치 회피.
    endsAt: "",
    myCoins: 142,
    byFish: shapeLeaderboard(rows, "me", 10),
  };
}

export function FishingLeaderboardHarness() {
  const [data] = useState<FishingLeaderboardData | null>(() => buildMock());

  return (
    <div className="space-y-3">
      <div className="mx-auto max-w-[640px] px-6 pt-4">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          DEV 하니스 — mock 순위. 붕어=본인 13위(top 밖 노출), 청새치=본인 1위,
          리바이어던=1명, 나머지=기록 없음.
        </div>
      </div>
      <FishingLeaderboardView data={data} loading={data === null} />
    </div>
  );
}
