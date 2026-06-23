"use client";

import { notFound } from "next/navigation";
import { WarTickerStrip, warTickerText } from "@/adventure/v2/WarTicker";
import { OUTPOSTS } from "@/adventure/data/v2/outposts";
import type { FeedEntry } from "@/lib/feed-config";

// /dev/war-ticker — 전광판 시각 QA (로그인·DB 없이). staging/dev 전용, prod 404.

// mock — warTickerText 는 createdAt 을 안 쓰므로 0 고정(렌더 순수성 린트 회피).
const [a, b, c] = OUTPOSTS;
const MOCK: FeedEntry[] = [
  {
    id: 1,
    type: "outpost_capture",
    actorName: "강철주먹",
    payload: { outpostId: a.id, guildName: "검은바위" },
    createdAt: 0,
  },
  {
    id: 2,
    type: "outpost_siege",
    actorName: "그림자칼",
    payload: { outpostId: b.id, fortHp: 60, fortMaxHp: 100, guildName: null },
    createdAt: 0,
  },
  {
    id: 3,
    type: "outpost_eject",
    actorName: "수문장",
    payload: { outpostId: c.id, targetName: "떠돌이도적" },
    createdAt: 0,
  },
  {
    id: 4,
    type: "outpost_capture",
    actorName: "몰락귀족",
    payload: { outpostId: b.id, lostToNpc: true },
    createdAt: 0,
  },
];
const TEXTS = MOCK.map(warTickerText).filter((t): t is string => t != null);

export default function WarTickerPreviewPage() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.IS_STAGING !== "true"
  ) {
    notFound();
  }
  return (
    <main className="min-h-screen bg-zinc-100 p-0 dark:bg-zinc-950">
      <WarTickerStrip texts={TEXTS} onClick={() => alert("→ /battle/subjugation")} />
      <div className="mx-auto max-w-[720px] space-y-2 p-6 text-sm text-zinc-600 dark:text-zinc-300">
        <p>↑ 전광판 4사건 — 한 줄 티커, 2바퀴 후 사라짐(onDone 미지정이라 여기선 멈춤)</p>
        <p className="text-xs text-zinc-500">
          아래: 1사건만 (최소 속도 14s 확인)
        </p>
        <WarTickerStrip texts={TEXTS.slice(0, 1)} />
        <p className="text-xs text-zinc-500">
          아래: 0사건 (띠 자체 숨김 = 아무것도 안 보여야 정상)
        </p>
        <WarTickerStrip texts={[]} />
      </div>
    </main>
  );
}
