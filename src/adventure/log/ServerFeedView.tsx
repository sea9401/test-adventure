"use client";

// 전체 소식 — 모험탭 하단 패널. 서버 전체에 흘러가는 자랑거리(유실된 명품 획득, 걸작 제작 성공).
// 글로벌 채팅과 분리된 "전광판". 최근 FEED_FETCH_LIMIT 개만 노출, FEED_POLL_MS 주기 폴링.
// 기본은 접힌 상태(최근 7개 미리보기) — 펼치면 전체. (옛 '내 소식 공유' 토글은 제거 — 피드 항상 기록.)

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CaretDown,
  CaretRight,
  Flag,
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
import { formatRelative } from "@/lib/notifications";
import {
  FEED_POLL_MS,
  type FeedEntry,
  type FeedType,
} from "@/lib/feed-config";

const PREVIEW_COUNT = 7;

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
    const kindName =
      RARE_MAP_KINDS[p.kind as keyof typeof RARE_MAP_KINDS]?.name ?? p.kind;
    return (
      <>
        {name} 님이 희귀한{" "}
        <span className="font-medium text-sky-600 dark:text-sky-400">
          「{kindName}」
        </span>{" "}
        발견!
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
          {formatRelative(e.createdAt)}
        </div>
      </span>
    </li>
  );
}

export function ServerFeedView() {
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const inFlight = useRef(false);

  const fetchFeed = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch("/api/feed");
      if (!res.ok) return;
      const data = (await res.json()) as { entries: FeedEntry[] };
      setEntries(Array.isArray(data.entries) ? data.entries : []);
      setLoaded(true);
    } catch {
      /* 폴링 — 조용히 무시 */
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    // 비동기 fetch 후 setState 라 cascading render 가 아니지만 린트는 호출 그래프만 보고 발화.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchFeed();
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void fetchFeed();
    };
    const id = setInterval(tick, FEED_POLL_MS);
    const onFocus = () => void fetchFeed();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchFeed]);

  if (!loaded) return null;

  const shown = open ? entries.slice().reverse() : entries.slice(-PREVIEW_COUNT).reverse();

  return (
    <Card as="section" padding="none" className="mt-4 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
      >
        <Megaphone
          size={16}
          weight="duotone"
          className="shrink-0 text-teal-600 dark:text-teal-400"
        />
        <span className="flex-1 text-sm font-medium text-zinc-700 dark:text-zinc-200">
          전체 소식
        </span>
        {entries.length > 0 && (
          <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
            {entries.length}
          </span>
        )}
        <span aria-hidden className="text-zinc-400 dark:text-zinc-500">
          {open ? (
            <CaretDown size={12} weight="bold" />
          ) : (
            <CaretRight size={12} weight="bold" />
          )}
        </span>
      </button>

      {entries.length === 0 ? (
        <div className="px-3 pb-3 pt-1 text-xs text-zinc-400 dark:text-zinc-500">
          아직 소식이 없습니다.
        </div>
      ) : (
        <ul className="divide-y divide-zinc-100 border-t border-zinc-100 dark:divide-zinc-800 dark:border-zinc-800">
          {shown.map((e) => (
            <FeedRow key={e.id} e={e} />
          ))}
        </ul>
      )}

    </Card>
  );
}
