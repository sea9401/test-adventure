"use client";

// 전쟁 전광판 — 상단 탭바 바로 아래 전역 한 줄 티커(docs/v2-war-visibility-plan.md PR-4).
// GameChrome(영속 틀)에 마운트 → 폴링 1곳·전 화면 노출. 최근 WAR_TICKER_WINDOW_MIN 분 안의
// 전쟁 사건(/api/feed?types=war)을 좌로 흘리고, 0건이면 띠 자체를 숨긴다.
// 클릭 → 토벌(/battle/subjugation). 모션 축소 환경은 CSS 가 애니메이션을 끔(최신 사건이 맨 앞).

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sword } from "@phosphor-icons/react";
import { outpostDisplayName as outpostName } from "@/adventure/data/v2/tileWarfare";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";
import { RARE_MAP_KINDS } from "@/adventure/data/v2/rareMaps";
import { parseCoopBossKindId, COOP_BOSSES } from "@/adventure/data/v2/coopBosses";
import { FISH, formatFishSize } from "@/adventure/data/v2/fish";
import {
  FEED_POLL_MS,
  WAR_TICKER_MAX_ITEMS,
  WAR_TICKER_WINDOW_MIN,
  type FeedEntry,
} from "@/lib/feed-config";

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
  if (e.type === "enhance_destroy") {
    const p = e.payload as { itemId: string; level: number };
    const name =
      (V2_EQUIPMENT as Record<string, { name?: string }>)[p.itemId]?.name ??
      p.itemId;
    return `${e.actorName} 님의 ${name} +${p.level}, 강화 중 파괴…`;
  }
  if (e.type === "coop_summon" || e.type === "coop_kill") {
    const p = e.payload as { kind: string };
    const kindId = parseCoopBossKindId(p.kind);
    const boss = kindId ? COOP_BOSSES[kindId].name : p.kind;
    return e.type === "coop_summon"
      ? `${e.actorName} 님이 협동 보스 ${boss} 소환! 토벌에 참여하세요`
      : `${e.actorName} 님이 협동 보스 ${boss} 처치 확정타!`;
  }
  if (e.type === "rare_map_drop") {
    const p = e.payload as { kind: string };
    const name =
      RARE_MAP_KINDS[p.kind as keyof typeof RARE_MAP_KINDS]?.name ?? p.kind;
    return `${e.actorName} 님이 희귀한 ${name} 발견!`;
  }
  if (e.type === "fishing_big_catch") {
    const p = e.payload as { fishId: string; size: number };
    const name = FISH[p.fishId as keyof typeof FISH]?.name ?? p.fishId;
    return `${e.actorName} 님이 ${name} ${formatFishSize(Math.round(p.size))} 대물 낚시!`;
  }
  if (e.type === "newcomer") {
    return `새 모험가 ${e.actorName} 님이 모험을 시작했습니다!`;
  }
  return null;
}

// 표시부 — 데이터는 prop 으로 받는다(/dev 프리뷰가 mock 으로 직접 렌더).
// 클래식 한 줄 티커: 내용 1벌이 오른쪽(padding-left 100%)에서 들어와 왼쪽으로 빠지길 무한 반복.
// 최근 사건을 계속 흘리는 "전광판" — 0건이면 호출부가 빈 배열을 줘 띠 자체가 숨는다(아래 null).
export function WarTickerStrip({
  texts,
  onClick,
}: {
  texts: string[];
  onClick?: () => void;
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
          animation: `war-ticker-pass ${durSec}s linear infinite`,
        }}
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

export function WarTicker() {
  const router = useRouter();
  const [texts, setTexts] = useState<string[]>([]);
  // 현재 흐르는 사건 묶음의 시그니처(id 목록). 내용이 바뀔 때만 갱신해 애니메이션 재시작 방지.
  const [sig, setSig] = useState("");
  const sigRef = useRef("");

  const fetchWarFeed = useCallback(async () => {
    try {
      const res = await fetch("/api/feed?types=war");
      if (!res.ok) return;
      const data = (await res.json()) as { entries?: FeedEntry[] };
      const cutoff = Date.now() - WAR_TICKER_WINDOW_MIN * 60_000;
      // 최근 윈도우 안 사건을 최신순으로, 최대 N개만(폭주 방지). seen 박제 없이 계속 노출.
      const recent = (data.entries ?? [])
        .filter((e) => e.createdAt >= cutoff)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, WAR_TICKER_MAX_ITEMS);
      const nextSig = recent.map((e) => e.id).join(",");
      // 내용 동일하면 state 안 건드림 → 무한 루프 애니메이션이 끊기지 않는다.
      if (nextSig === sigRef.current) return;
      sigRef.current = nextSig;
      setTexts(recent.map(warTickerText).filter((t): t is string => t != null));
      setSig(nextSig);
    } catch {
      /* 폴링 — 조용히 무시 */
    }
  }, []);

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
      key={sig} // 묶음 내용이 바뀌면 리마운트 → 애니메이션을 처음부터
      texts={texts}
      onClick={() => router.push("/battle/subjugation")}
    />
  );
}
