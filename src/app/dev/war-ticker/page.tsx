"use client";

import { notFound } from "next/navigation";
import { WarTickerStrip, warTickerText } from "@/adventure/v2/WarTicker";
import { OUTPOSTS } from "@/adventure/data/v2/outposts";
import type { FeedEntry } from "@/lib/feed-config";

// /dev/war-ticker — 전광판 시각 QA (로그인·DB 없이). staging/dev 전용, prod 404.

const PREVIEW_NOW = Date.UTC(2026, 7, 4, 11, 20);

// mock — 고정 시각을 주입해 상대 시간도 항상 같은 모습으로 QA한다.
const [a, b, c] = OUTPOSTS;
const MOCK: FeedEntry[] = [
  {
    id: 1,
    type: "outpost_capture",
    actorName: "강철주먹",
    payload: { outpostId: a.id, guildName: "검은바위" },
    createdAt: PREVIEW_NOW - 60_000,
  },
  {
    id: 2,
    type: "outpost_siege",
    actorName: "그림자칼",
    payload: { outpostId: b.id, fortHp: 60, fortMaxHp: 100, guildName: null },
    createdAt: PREVIEW_NOW - 2 * 60_000,
  },
  {
    id: 3,
    type: "outpost_eject",
    actorName: "수문장",
    payload: { outpostId: c.id, targetName: "떠돌이도적" },
    createdAt: PREVIEW_NOW - 3 * 60_000,
  },
  {
    id: 4,
    type: "outpost_capture",
    actorName: "몰락귀족",
    payload: { outpostId: b.id, lostToNpc: true },
    createdAt: PREVIEW_NOW - 4 * 60_000,
  },
  {
    id: 5,
    type: "coop_summon",
    actorName: "별빛사냥꾼",
    payload: {
      kind: "mountain_chief",
      sessionId: "preview-coop",
      expiresAt: PREVIEW_NOW + 2 * 3_600_000,
    },
    createdAt: PREVIEW_NOW - 12 * 60_000,
  },
];
const TEXTS = MOCK.map((entry) => warTickerText(entry, PREVIEW_NOW)).filter(
  (text): text is string => text != null,
);

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
        <p>↑ 전광판 4사건 — 한 줄 티커, 무한 반복(0건이면 띠 자체가 숨음)</p>
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
