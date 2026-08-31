"use client";

// 전체 소식 — 모험탭 하단 패널. 서버 전체에 흘러가는 자랑거리(유실된 명품 획득, 걸작 제작 성공).
// 글로벌 채팅과 분리된 "전광판". 한 페이지에 30건씩 과거 페이지를 이어서 조회하고,
// FEED_POLL_MS 주기로 최신 소식을 갱신한다. 상시 펼침 — 분류 칩 + 전체 목록 항상 노출.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Fish,
  Crown,
  Flag,
  HandWaving,
  Hammer,
  Lightning,
  Megaphone,
  ShieldCheck,
  Skull,
  Sparkle,
  Sword,
  MapTrifold,
} from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { ITEMS } from "@/adventure/data/items";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";
import { OUTPOST_BY_ID } from "@/adventure/data/v2/outposts";
import { RARE_MAP_KINDS } from "@/adventure/data/v2/rareMaps";
import { parseCoopBossKindId, COOP_BOSSES } from "@/adventure/data/v2/coopBosses";
import { FISH, formatFishSize } from "@/adventure/data/v2/fish";
import { formatDateTime, formatRelative } from "@/lib/notifications";
import {
  LIFE_CRAFTING_RECIPE_BY_ID,
  isLifeCraftingRecipeAvailable,
} from "@/adventure/v2/lifeCrafting";
import { LIFE_FIELD_DISCOVERIES } from "@/adventure/v2/lifeFieldRecords";
import {
  FEED_CATEGORIES,
  FEED_CATEGORY_LABEL,
  FEED_FETCH_LIMIT,
  FEED_POLL_MS,
  type FeedCategory,
  type FeedEntry,
  type FeedType,
} from "@/lib/feed-config";

type FeedResponse = {
  entries?: FeedEntry[];
  hasMore?: boolean;
};

function itemName(itemId: string): string {
  // v2 장비 카탈로그 우선(소식의 유니크 드랍은 v2 장비 id) → 없으면 v1 ITEMS → raw id.
  const v2 = (V2_EQUIPMENT as Record<string, { name?: string }>)[itemId]?.name;
  if (v2) return v2;
  return (ITEMS as Record<string, { name?: string }>)[itemId]?.name ?? itemId;
}

const TYPE_ICON: Record<FeedType, React.ReactNode> = {
  unique_drop: (
    <Sparkle
      size={14}
      weight="fill"
      className="shrink-0 text-violet-500 dark:text-violet-400"
    />
  ),
  masterpiece: (
    <Hammer
      size={14}
      weight="fill"
      className="shrink-0 text-amber-500 dark:text-amber-400"
    />
  ),
  outpost_capture: (
    <Flag
      size={14}
      weight="fill"
      className="shrink-0 text-rose-500 dark:text-rose-400"
    />
  ),
  outpost_siege: (
    <Sword
      size={14}
      weight="fill"
      className="shrink-0 text-orange-500 dark:text-orange-400"
    />
  ),
  outpost_eject: (
    <ShieldCheck
      size={14}
      weight="fill"
      className="shrink-0 text-emerald-500 dark:text-emerald-400"
    />
  ),
  enhance_high: (
    <Lightning
      size={14}
      weight="fill"
      className="shrink-0 text-amber-500 dark:text-amber-400"
    />
  ),
  enhance_destroy: (
    <Lightning
      size={14}
      weight="fill"
      className="shrink-0 text-rose-500 dark:text-rose-400"
    />
  ),
  rare_map_drop: (
    <MapTrifold
      size={14}
      weight="fill"
      className="shrink-0 text-sky-500 dark:text-sky-400"
    />
  ),
  coop_summon: (
    <Skull
      size={14}
      weight="fill"
      className="shrink-0 text-rose-500 dark:text-rose-400"
    />
  ),
  coop_kill: (
    <Skull
      size={14}
      weight="fill"
      className="shrink-0 text-emerald-500 dark:text-emerald-400"
    />
  ),
  fishing_big_catch: (
    <Fish
      size={14}
      weight="fill"
      className="shrink-0 text-cyan-500 dark:text-cyan-400"
    />
  ),
  cultivation_awakening: (
    <Sparkle
      size={14}
      weight="fill"
      className="shrink-0 text-fuchsia-500 dark:text-fuchsia-400"
    />
  ),
  newcomer: (
    <HandWaving
      size={14}
      weight="fill"
      className="shrink-0 text-teal-500 dark:text-teal-400"
    />
  ),
  life_blueprint: (
    <Sparkle size={14} weight="fill" className="shrink-0 text-amber-500 dark:text-amber-400" />
  ),
  life_discovery: (
    <Sparkle size={14} weight="fill" className="shrink-0 text-violet-500 dark:text-violet-400" />
  ),
  cooking_discovery: (
    <Sparkle size={14} weight="fill" className="shrink-0 text-orange-500 dark:text-orange-400" />
  ),
  codex_research_result: (
    <Crown size={14} weight="fill" className="shrink-0 text-violet-500 dark:text-violet-400" />
  ),
};

function outpostName(outpostId: string): string {
  return OUTPOST_BY_ID.get(outpostId)?.name ?? outpostId;
}

function entryText(e: FeedEntry): React.ReactNode {
  const name = (
    <span className="font-medium text-zinc-700 dark:text-zinc-200">
      {e.actorName}
    </span>
  );
  if (e.type === "rare_map_drop") {
    const p = e.payload as { kind: string };
    const def = RARE_MAP_KINDS[p.kind as keyof typeof RARE_MAP_KINDS];
    const kindName = def?.name ?? p.kind;
    return (
      <>
        {name} 님이{" "}
        {def?.category === "location"
          ? "희귀 장소"
          : def?.category === "utility"
            ? "희귀 물품"
            : "희귀 탐사"}{" "}
        <span className="font-medium text-sky-600 dark:text-sky-400">
          「{kindName}」
        </span>{" "}
        {def?.category === "utility" ? "획득!" : "개방!"}
      </>
    );
  }
  if (e.type === "coop_summon" || e.type === "coop_kill") {
    const p = e.payload as { kind: string };
    const kindId = parseCoopBossKindId(p.kind);
    const bossName = kindId ? COOP_BOSSES[kindId].name : p.kind;
    const boss = (
      <span className="font-medium text-rose-600 dark:text-rose-400">
        「{bossName}」
      </span>
    );
    return e.type === "coop_summon" ? (
      <>
        {name} 님이 협동 보스 {boss} 소환! 모두 토벌에 참여하세요
      </>
    ) : (
      <>
        {name} 님이 협동 보스 {boss} 처치 확정타! 기여 보상을 수령하세요
      </>
    );
  }
  if (e.type === "unique_drop") {
    const p = e.payload as { itemId: string };
    return (
      <>
        {name} 님이 유실된 명품{" "}
        <span className="font-medium text-violet-600 dark:text-violet-400">
          {itemName(p.itemId)}
        </span>{" "}
        발견!
      </>
    );
  }
  if (e.type === "fishing_big_catch") {
    const p = e.payload as { fishId: string; size: number };
    const fishName = FISH[p.fishId as keyof typeof FISH]?.name ?? p.fishId;
    return (
      <>
        {name} 님이{" "}
        <span className="font-medium text-cyan-600 dark:text-cyan-400">
          {fishName} {formatFishSize(Math.round(p.size))}
        </span>{" "}
        대물 낚시!
      </>
    );
  }
  if (e.type === "cultivation_awakening") {
    return (
      <>
        {name} 님이 수행에서{" "}
        <span className="font-medium text-fuchsia-600 dark:text-fuchsia-400">
          각성
        </span>
        ! 스탯 한계치 증가량 ×5
      </>
    );
  }
  if (e.type === "outpost_capture") {
    const p = e.payload as {
      outpostId: string;
      guildName?: string | null;
      lostToNpc?: boolean;
      treasuryGold?: number;
    };
    const where = (
      <span className="font-medium text-rose-600 dark:text-rose-400">
        {outpostName(p.outpostId)}
      </span>
    );
    if (p.lostToNpc) {
      return (
        <>
          {name} 님의 {where} 점령이 NPC 수비대에 무너졌다
        </>
      );
    }
    const jackpot = (p.treasuryGold ?? 0) > 0 && (
      <span className="font-medium tabular-nums text-yellow-600 dark:text-yellow-400">
        {" "}
        — 금고 {p.treasuryGold!.toLocaleString()} G 획득!
      </span>
    );
    return p.guildName ? (
      <>
        <span className="font-medium text-zinc-700 dark:text-zinc-200">
          {p.guildName} 길드
        </span>
        가 {where} 점령!{jackpot}
      </>
    ) : (
      <>
        {name} 님이 {where} 점령!{jackpot}
      </>
    );
  }
  if (e.type === "outpost_siege") {
    const p = e.payload as {
      outpostId: string;
      fortHp: number;
      fortMaxHp: number;
      guildName?: string | null;
    };
    const subject = p.guildName ? (
      <span className="font-medium text-zinc-700 dark:text-zinc-200">
        {p.guildName} 길드
      </span>
    ) : (
      <>{name} 님</>
    );
    return (
      <>
        {subject}이 {outpostName(p.outpostId)} 성벽 공격{" "}
        <span className="tabular-nums text-orange-600 dark:text-orange-400">
          ({p.fortHp}/{p.fortMaxHp})
        </span>
      </>
    );
  }
  if (e.type === "enhance_high") {
    const p = e.payload as { itemId: string; level: number };
    return (
      <>
        {name} 님이{" "}
        <span className="font-medium text-amber-600 dark:text-amber-400">
          {itemName(p.itemId)} +{p.level}
        </span>{" "}
        강화 성공!
      </>
    );
  }
  if (e.type === "enhance_destroy") {
    const p = e.payload as { itemId: string; level: number };
    return (
      <>
        {name} 님의{" "}
        <span className="font-medium text-rose-600 dark:text-rose-400">
          {itemName(p.itemId)} +{p.level}
        </span>{" "}
        강화 중 파괴…
      </>
    );
  }
  if (e.type === "outpost_eject") {
    const p = e.payload as { outpostId: string; targetName: string };
    return (
      <>
        {name} 님이 {outpostName(p.outpostId)}에서 침입자{" "}
        <span className="font-medium text-emerald-600 dark:text-emerald-400">
          {p.targetName}
        </span>{" "}
        토벌!
      </>
    );
  }
  if (e.type === "newcomer") {
    return (
      <>
        새 모험가 {name} 님이{" "}
        <span className="font-medium text-teal-600 dark:text-teal-400">
          모험을 시작
        </span>
        했습니다!
      </>
    );
  }
  if (e.type === "life_blueprint") {
    const p = e.payload as { recipeId: string };
    return <>{name} 님이 숨겨진 도안 <span className="font-medium text-amber-600 dark:text-amber-400">{LIFE_CRAFTING_RECIPE_BY_ID.get(p.recipeId)?.name ?? p.recipeId}</span> 발견!</>;
  }
  if (e.type === "life_discovery") {
    const p = e.payload as { discoveryId: string };
    const discovery =
      LIFE_FIELD_DISCOVERIES[
        p.discoveryId as keyof typeof LIFE_FIELD_DISCOVERIES
      ];
    return (
      <>
        {name} 님이 희귀 현장 기록{" "}
        <span className="font-medium text-violet-600 dark:text-violet-400">
          {discovery?.label ?? p.discoveryId}
        </span>{" "}
        완성!
      </>
    );
  }
  if (e.type === "cooking_discovery") {
    const p = e.payload as { recipeName?: string };
    return <>{name} 님이 숨은 요리 <span className="font-medium text-orange-600 dark:text-orange-400">{p.recipeName?.trim() || "이름이 공개된 요리"}</span>의 최초 레시피를 개발했습니다!</>;
  }
  if (e.type === "codex_research_result") {
    const p = e.payload as { seasonId: string; themeName: string; tier: import("@/adventure/data/v2/codexMasteryTrophies").CodexMasteryTrophyTier; finalRank: number };
    const labels = { bronze: "동", silver: "은", gold: "금", platinum: "백금", diamond: "다이아", legendary: "전설" } as const;
    return <>{name} 님이 {p.seasonId} {p.themeName} <span className="font-medium text-violet-600 dark:text-violet-400">확정 {p.finalRank}위 · {labels[p.tier]} 트로피</span>를 기록했습니다!</>;
  }
  // masterpiece
  const p = e.payload as { itemId: string };
  return (
    <>
      {name} 님이 걸작{" "}
      <span className="font-medium text-amber-600 dark:text-amber-400">
        {itemName(p.itemId)}
      </span>{" "}
      제작!
    </>
  );
}

function FeedRow({ e }: { e: FeedEntry }) {
  return (
    <li className="flex items-start gap-2 px-3 py-2">
      <span className="mt-0.5">{TYPE_ICON[e.type]}</span>
      <span className="min-w-0 flex-1">
        <div className="text-sm text-zinc-600 dark:text-zinc-300">
          {entryText(e)}
        </div>
        <div className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">
          {formatRelative(e.createdAt)} · {formatDateTime(e.createdAt)}
        </div>
      </span>
    </li>
  );
}

function isFeedEntryAvailable(e: FeedEntry): boolean {
  if (e.type !== "life_blueprint") return true;
  const recipeId = (e.payload as { recipeId?: unknown }).recipeId;
  const recipe = typeof recipeId === "string"
    ? LIFE_CRAFTING_RECIPE_BY_ID.get(recipeId)
    : undefined;
  return !recipe || isLifeCraftingRecipeAvailable(recipe);
}

export function ServerFeedView() {
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  // 분류별 보기 — null = 전체. 펼친 상태에서 칩으로 전환(서버 필터 재조회).
  const [category, setCategory] = useState<FeedCategory | null>(null);
  const [beforeId, setBeforeId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  // 각 페이지를 열 때 사용한 cursor. 1페이지는 null, N페이지는 직전 페이지의 최솟값 id.
  const [pageCursors, setPageCursors] = useState<Array<number | null>>([null]);
  const categoryRef = useRef<FeedCategory | null>(null);
  const beforeIdRef = useRef<number | null>(null);
  const latestRequestId = useRef(0);

  const fetchFeed = useCallback(async (signal?: AbortSignal) => {
    const requestedCategory = category;
    const requestedBeforeId = beforeId;
    const requestId = ++latestRequestId.current;
    try {
      const params = new URLSearchParams();
      if (requestedCategory) params.set("category", requestedCategory);
      if (requestedBeforeId !== null) {
        params.set("before", String(requestedBeforeId));
      }
      const query = params.size > 0 ? `?${params.toString()}` : "";
      const res = await fetch(`/api/feed${query}`, { signal });
      if (!res.ok) {
        if (
          requestId === latestRequestId.current &&
          categoryRef.current === requestedCategory &&
          beforeIdRef.current === requestedBeforeId
        ) {
          setLoaded(true);
          setLoading(false);
        }
        return;
      }
      const data = (await res.json()) as FeedResponse;
      if (
        requestId !== latestRequestId.current ||
        categoryRef.current !== requestedCategory ||
        beforeIdRef.current !== requestedBeforeId
      ) {
        return;
      }
      setEntries(Array.isArray(data.entries) ? data.entries : []);
      setHasMore(data.hasMore === true);
      setLoaded(true);
      setLoading(false);
    } catch {
      if (
        !signal?.aborted &&
        requestId === latestRequestId.current &&
        categoryRef.current === requestedCategory &&
        beforeIdRef.current === requestedBeforeId
      ) {
        setLoaded(true);
        setLoading(false);
      }
    }
  }, [beforeId, category]);

  useEffect(() => {
    const controller = new AbortController();
    // 상태 변경은 첫 fetch가 resolve된 뒤 실행되지만 lint는 비동기 호출 그래프를 보수적으로 판정한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchFeed(controller.signal);
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void fetchFeed();
    };
    const id = setInterval(tick, FEED_POLL_MS);
    const onFocus = () => void fetchFeed();
    window.addEventListener("focus", onFocus);
    return () => {
      controller.abort();
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchFeed]);

  const selectCategory = (next: FeedCategory | null) => {
    if (next === categoryRef.current) return;
    categoryRef.current = next;
    beforeIdRef.current = null;
    latestRequestId.current += 1;
    setEntries([]);
    setHasMore(false);
    setLoading(true);
    setPage(1);
    setPageCursors([null]);
    setBeforeId(null);
    setCategory(next);
  };

  const goToNextPage = () => {
    const nextBeforeId = entries[0]?.id;
    if (loading || !hasMore || nextBeforeId === undefined) return;

    latestRequestId.current += 1;
    beforeIdRef.current = nextBeforeId;
    setPageCursors((current) => [
      ...current.slice(0, page),
      nextBeforeId,
    ]);
    setEntries([]);
    setLoading(true);
    setPage((current) => current + 1);
    setBeforeId(nextBeforeId);
  };

  const goToPreviousPage = () => {
    if (loading || page <= 1) return;

    const previousBeforeId = pageCursors[page - 2] ?? null;
    latestRequestId.current += 1;
    beforeIdRef.current = previousBeforeId;
    setEntries([]);
    setLoading(true);
    setPage((current) => current - 1);
    setBeforeId(previousBeforeId);
  };

  if (!loaded) return null;

  const shown = entries.filter(isFeedEntryAvailable).reverse();

  return (
    <Card as="section" padding="none" className="mt-4 overflow-hidden">
      <div className="flex w-full items-center gap-2 px-3 py-2">
        <Megaphone
          size={16}
          weight="duotone"
          className="shrink-0 text-teal-600 dark:text-teal-400"
        />
        <span className="flex-1 text-sm font-medium text-zinc-700 dark:text-zinc-200">
          전체 소식
        </span>
        <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
          최근 6개월 · 페이지당 {FEED_FETCH_LIMIT}건
        </span>
      </div>

      {/* 분류 칩 — 선택 시 서버 필터 재조회(6개월 보관분에서 그 분류만). */}
      <div className="flex flex-wrap gap-1 border-t border-zinc-100 px-3 py-2 dark:border-zinc-800">
        {([null, ...FEED_CATEGORIES] as (FeedCategory | null)[]).map((c) => {
          const selected = category === c;
          return (
            <button
              key={c ?? "all"}
              type="button"
              aria-pressed={selected}
              onClick={() => selectCategory(c)}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
                selected
                  ? "border-teal-500 bg-teal-50 font-medium text-teal-700 dark:border-teal-600 dark:bg-teal-950 dark:text-teal-300"
                  : "border-zinc-200 bg-zinc-50 text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
            >
              {c ? FEED_CATEGORY_LABEL[c] : "전체"}
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <div className="px-3 pb-3 pt-1 text-xs text-zinc-400 dark:text-zinc-500">
          {loading
            ? "소식을 불러오는 중입니다."
            : category
              ? `${FEED_CATEGORY_LABEL[category]} 소식이 없습니다.`
              : "아직 소식이 없습니다."}
        </div>
      ) : (
        <ul className="divide-y divide-zinc-100 border-t border-zinc-100 dark:divide-zinc-800 dark:border-zinc-800">
          {shown.map((e) => (
            <FeedRow key={e.id} e={e} />
          ))}
        </ul>
      )}

      {(page > 1 || hasMore) && (
        <nav
          aria-label="전체 소식 페이지"
          className="flex items-center justify-center gap-3 border-t border-zinc-100 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <button
            type="button"
            disabled={loading || page <= 1}
            onClick={goToPreviousPage}
            className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:cursor-wait disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            이전
          </button>
          <span
            aria-current="page"
            className="min-w-14 text-center text-xs font-medium tabular-nums text-zinc-600 dark:text-zinc-300"
          >
            {page}페이지
          </span>
          <button
            type="button"
            disabled={loading || !hasMore}
            onClick={goToNextPage}
            className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:cursor-wait disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            다음
          </button>
        </nav>
      )}
    </Card>
  );
}
