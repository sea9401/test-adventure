"use client";

// 전쟁 전광판 — 상단 탭바 바로 아래 전역 한 줄 티커(docs/v2-war-visibility-plan.md PR-4).
// GameChrome(영속 틀)에 마운트 → 폴링 1곳·전 화면 노출. 최근 WAR_TICKER_WINDOW_H 안의
// 전쟁 사건(/api/feed?types=war)을 좌로 흘리고, 0건이면 띠 자체를 숨긴다.
// 클릭 → 전황(/battle/war). 모션 축소 환경은 CSS 가 애니메이션을 끔(최신 사건이 맨 앞).

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sword } from "@phosphor-icons/react";
import { OUTPOST_BY_ID } from "@/adventure/data/v2/outposts";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";
import {
  FEED_POLL_MS,
  WAR_TICKER_WINDOW_H,
  type FeedEntry,
} from "@/lib/feed-config";

function outpostName(outpostId: string): string {
  return OUTPOST_BY_ID.get(outpostId)?.name ?? outpostId;
}

// 한 사건 → 티커 한 토막(컴팩트 플레인 텍스트). 모르는 타입은 null(렌더 제외).
export function warTickerText(e: FeedEntry): string | null {
  if (e.type === "outpost_capture") {
    const p = e.payload as {
      outpostId: string;
      guildName?: string | null;
      lostToNpc?: boolean;
      treasuryGold?: number;
    };
    if (p.lostToNpc) {
      return `${e.actorName}의 ${outpostName(p.outpostId)} 점령이 NPC 수비대에 무너졌다`;
    }
    const subject = p.guildName ? `${p.guildName} 길드` : e.actorName;
    const jackpot = (p.treasuryGold ?? 0) > 0
      ? ` — 금고 ${p.treasuryGold!.toLocaleString()}G 획득!`
      : "";
    return `${subject}, ${outpostName(p.outpostId)} 점령!${jackpot}`;
  }
  if (e.type === "outpost_siege") {
    const p = e.payload as {
      outpostId: string;
      fortHp: number;
      fortMaxHp: number;
      guildName?: string | null;
    };
    const subject = p.guildName ? `${p.guildName} 길드` : e.actorName;
    return `${subject}, ${outpostName(p.outpostId)} 성벽 공격 (${p.fortHp}/${p.fortMaxHp})`;
  }
  if (e.type === "outpost_eject") {
    const p = e.payload as { outpostId: string; targetName: string };
    return `${e.actorName}, ${outpostName(p.outpostId)}에서 침입자 ${p.targetName} 토벌`;
  }
  if (e.type === "enhance_high") {
    const p = e.payload as { itemId: string; level: number };
    const name =
      (V2_EQUIPMENT as Record<string, { name?: string }>)[p.itemId]?.name ??
      p.itemId;
    return `${e.actorName} 님이 ${name} +${p.level} 강화 성공!`;
  }
  return null;
}

// 표시부 — 데이터는 prop 으로 받는다(/dev 프리뷰가 mock 으로 직접 렌더).
// 클래식 한 줄 티커: 내용 1벌이 오른쪽(padding-left 100%)에서 들어와 왼쪽으로 완전히
// 빠지면 1바퀴. PASSES 바퀴를 다 돌면 animationend → onDone(띠 사라짐).
export const WAR_TICKER_PASSES = 2;

export function WarTickerStrip({
  texts,
  onClick,
  onDone,
}: {
  texts: string[];
  onClick?: () => void;
  /** 지정 바퀴 완주 시 — 호출부가 띠를 숨긴다. 미지정이면 계속 반복하지 않고 멈춘 채 유지. */
  onDone?: () => void;
}) {
  if (texts.length === 0) return null;
  // 속도(바퀴당) — 토막 수 비례(토막당 ~7s, 최소 14s).
  const durSec = Math.max(14, texts.length * 7);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="전쟁 보기"
      className="group block w-full cursor-pointer overflow-hidden whitespace-nowrap border-b border-zinc-200 bg-zinc-100/80 py-1 text-xs text-zinc-600 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-300"
    >
      <span
        className="war-ticker-pass inline-flex w-max pl-[100vw] group-hover:[animation-play-state:paused]"
        style={{
          animation: `war-ticker-pass ${durSec}s linear ${WAR_TICKER_PASSES}`,
        }}
        onAnimationEnd={onDone}
      >
        {texts.map((t, i) => (
          <span key={i} className="inline-flex items-center gap-1.5 pr-10">
            <Sword
              size={12}
              weight="fill"
              className="shrink-0 text-rose-500 dark:text-rose-400"
            />
            {t}
          </span>
        ))}
      </span>
    </button>
  );
}

// 완주한 사건은 다시 안 보여줌 — 최댓값 사건 id 를 localStorage 에 박제(새로고침에도 유지).
const SEEN_KEY = "war-ticker-seen.v1";
function seenMaxId(): number {
  try {
    return Number(localStorage.getItem(SEEN_KEY)) || 0;
  } catch {
    return 0;
  }
}
function markSeen(maxId: number) {
  try {
    localStorage.setItem(SEEN_KEY, String(maxId));
  } catch {
    /* 사파리 프라이빗 등 — 세션 내 state 로만 동작 */
  }
}

export function WarTicker() {
  const router = useRouter();
  const [texts, setTexts] = useState<string[]>([]);
  const [maxId, setMaxId] = useState(0);

  const fetchWarFeed = useCallback(async () => {
    try {
      const res = await fetch("/api/feed?types=war");
      if (!res.ok) return;
      const data = (await res.json()) as { entries?: FeedEntry[] };
      const cutoff = Date.now() - WAR_TICKER_WINDOW_H * 3_600_000;
      const fresh = (data.entries ?? [])
        .filter((e) => e.createdAt >= cutoff && e.id > seenMaxId())
        .sort((a, b) => b.createdAt - a.createdAt); // 최신 먼저 — 모션 축소 시 맨 앞 노출
      const next = fresh
        .map(warTickerText)
        .filter((t): t is string => t != null);
      // 이미 돌고 있는 묶음과 같으면 갱신 안 함(애니메이션 재시작 방지).
      const nextMax = fresh.reduce((m, e) => Math.max(m, e.id), 0);
      if (nextMax > maxId) {
        setTexts(next);
        setMaxId(nextMax);
      }
    } catch {
      /* 폴링 — 조용히 무시 */
    }
  }, [maxId]);

  useEffect(() => {
    // 비동기 fetch 후 setState 라 cascading render 아님 — ServerFeedView 와 동일 패턴.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchWarFeed();
    const tick = () => {
      // 비활성 탭은 폴링 중단 — 전광판은 영속 chrome 의 유일한 폴링이라 필수.
      if (typeof document !== "undefined" && document.hidden) return;
      void fetchWarFeed();
    };
    const id = setInterval(tick, FEED_POLL_MS);
    const onFocus = () => void fetchWarFeed();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchWarFeed]);

  return (
    <WarTickerStrip
      key={maxId} // 새 묶음 도착 시 리마운트 — 애니메이션을 처음부터(2바퀴 보장)
      texts={texts}
      onClick={() => router.push("/battle/war")}
      onDone={() => {
        // 2바퀴 완주 — 이 묶음은 박제하고 띠를 내린다. 다음 새 사건에 다시 등장.
        markSeen(maxId);
        setTexts([]);
      }}
    />
  );
}
