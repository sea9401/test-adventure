"use client";

// 전쟁 전광판 — 상단 탭바 바로 아래 전역 한 줄 티커(docs/v2-war-visibility-plan.md PR-4).
// GameChrome(영속 틀)에 마운트 → 폴링 1곳·전 화면 노출. 최근 WAR_TICKER_WINDOW_MIN 분 안의
// 전쟁 사건(/api/feed?types=war)을 좌로 흘리고, 0건이면 띠 자체를 숨긴다.
// 클릭 → 전체 소식(/plaza/feed). 모션 축소 환경은 CSS 가 애니메이션을 끔(최신 사건이 맨 앞).

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sword } from "@phosphor-icons/react";
import { outpostDisplayName as outpostName } from "@/adventure/data/v2/tileWarfare";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";
import { RARE_MAP_KINDS } from "@/adventure/data/v2/rareMaps";
import {
  parseCoopBossKindId,
  coopBossDurationMs,
  COOP_BOSSES,
} from "@/adventure/data/v2/coopBosses";
import { FISH, formatFishSize } from "@/adventure/data/v2/fish";
import { CODEX_MASTERY_TROPHY_TIER_LABELS } from "@/adventure/data/v2/codexMasteryTrophies";
import { formatRelative } from "@/lib/notifications";
import {
  LIFE_CRAFTING_RECIPE_BY_ID,
  isLifeCraftingRecipeAvailable,
} from "@/adventure/v2/lifeCrafting";
import { LIFE_FIELD_DISCOVERIES } from "@/adventure/v2/lifeFieldRecords";
import {
  FEED_POLL_MS,
  WAR_TICKER_MAX_ITEMS,
  WAR_TICKER_WINDOW_MIN,
  type FeedEntry,
} from "@/lib/feed-config";
import { COOKING_PUBLIC_RECIPE_BY_ID } from "./cooking/catalog";

type CoopFeedPayload = {
  kind: string;
  sessionId?: string;
  expiresAt?: number;
};

function coopSummonExpiresAt(e: FeedEntry): number {
  const payload = e.payload as CoopFeedPayload;
  if (
    typeof payload.expiresAt === "number" &&
    Number.isFinite(payload.expiresAt)
  ) {
    return payload.expiresAt;
  }
  const kindId = parseCoopBossKindId(payload.kind);
  return kindId
    ? e.createdAt + coopBossDurationMs(COOP_BOSSES[kindId])
    : e.createdAt;
}

/** 최근 전광판 항목 중 아직 참여 가능한 협동 보스 소환만 남긴다. */
export function visibleWarTickerEntries(
  entries: readonly FeedEntry[],
  now = Date.now(),
): FeedEntry[] {
  const cutoff = now - WAR_TICKER_WINDOW_MIN * 60_000;
  const defeatedSessionIds = new Set(
    entries
      .filter((entry) => entry.type === "coop_kill")
      .map((entry) => (entry.payload as CoopFeedPayload).sessionId)
      .filter((sessionId): sessionId is string => Boolean(sessionId)),
  );

  return entries
    .filter((entry) => {
      if (entry.createdAt < cutoff) return false;
      if (entry.type !== "coop_summon") return true;
      const payload = entry.payload as CoopFeedPayload;
      return (
        coopSummonExpiresAt(entry) > now &&
        (!payload.sessionId || !defeatedSessionIds.has(payload.sessionId))
      );
    })
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, WAR_TICKER_MAX_ITEMS);
}

// 한 사건 → 티커 한 토막(컴팩트 플레인 텍스트). 모르는 타입은 null(렌더 제외).
export function warTickerText(
  e: FeedEntry,
  now = Date.now(),
): string | null {
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
    const p = e.payload as CoopFeedPayload;
    const kindId = parseCoopBossKindId(p.kind);
    const boss = kindId ? COOP_BOSSES[kindId].name : p.kind;
    return e.type === "coop_summon"
      ? `${e.actorName} 님이 협동 보스 ${boss} 소환! 토벌에 참여하세요 · ${formatRelative(e.createdAt, now)}`
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
  if (e.type === "cultivation_awakening") {
    return `${e.actorName} 님이 수행에서 각성! 스탯 한계치 증가량 ×5`;
  }
  if (e.type === "newcomer") {
    return `새 모험가 ${e.actorName} 님이 모험을 시작했습니다!`;
  }
  if (e.type === "life_blueprint") {
    const p = e.payload as { recipeId: string };
    const recipe = LIFE_CRAFTING_RECIPE_BY_ID.get(p.recipeId);
    if (recipe && !isLifeCraftingRecipeAvailable(recipe)) return null;
    return `${e.actorName} 님이 숨겨진 도안 ${recipe?.name ?? p.recipeId} 발견!`;
  }
  if (e.type === "life_discovery") {
    const p = e.payload as { discoveryId: string };
    const discovery =
      LIFE_FIELD_DISCOVERIES[
        p.discoveryId as keyof typeof LIFE_FIELD_DISCOVERIES
      ];
    return `${e.actorName} 님이 희귀 현장 기록 ${discovery?.label ?? p.discoveryId} 완성!`;
  }
  if (e.type === "cooking_discovery") {
    const p = e.payload as { recipeId: string };
    return `${e.actorName} 님이 숨은 요리 ${COOKING_PUBLIC_RECIPE_BY_ID.get(p.recipeId)?.name ?? p.recipeId} 최초 개발!`;
  }
  if (e.type === "codex_research_result") {
    const p = e.payload as {
      seasonId: string;
      themeName: string;
      tier: keyof typeof CODEX_MASTERY_TROPHY_TIER_LABELS;
      finalRank: number;
    };
    return `${e.actorName} 님, ${p.seasonId} ${p.themeName} 확정 ${p.finalRank}위 · ${CODEX_MASTERY_TROPHY_TIER_LABELS[p.tier]} 트로피!`;
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
      aria-label="전체 소식 보기"
      className="war-ticker-alert group block w-full cursor-pointer overflow-hidden whitespace-nowrap border-b border-zinc-200 bg-zinc-100/80 py-1 text-xs text-zinc-600 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-300"
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
  const textSigRef = useRef("");

  const fetchWarFeed = useCallback(async () => {
    try {
      const res = await fetch("/api/feed?types=war");
      if (!res.ok) return;
      const data = (await res.json()) as { entries?: FeedEntry[] };
      const now = Date.now();
      // 최근 윈도우 안 사건을 최신순으로, 최대 N개만. 만료·처치된 보스 소환은 모집에서 제외.
      const recent = visibleWarTickerEntries(data.entries ?? [], now);
      const nextSig = recent.map((e) => e.id).join(",");
      const nextTexts = recent
        .map((entry) => warTickerText(entry, now))
        .filter((text): text is string => text != null);
      const nextTextSig = nextTexts.join("\u0000");
      // 사건과 상대시간 문구가 모두 같으면 state를 건드리지 않는다. 시간만 바뀌면 동일 key로
      // 텍스트만 갱신해 애니메이션을 처음부터 다시 시작하지 않는다.
      if (nextSig === sigRef.current && nextTextSig === textSigRef.current) {
        return;
      }
      textSigRef.current = nextTextSig;
      setTexts(nextTexts);
      if (nextSig !== sigRef.current) {
        sigRef.current = nextSig;
        setSig(nextSig);
      }
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
      onClick={() => router.push("/plaza/feed")}
    />
  );
}
