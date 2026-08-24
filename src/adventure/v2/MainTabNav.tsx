"use client";

import { useEffect, useRef, useState } from "react";
import {
  Backpack,
  Bank,
  Binoculars,
  BookOpen,
  Buildings,
  BoxingGlove,
  BowlFood,
  CaretDown,
  CastleTurret,
  CloudLightning,
  Compass,
  CookingPot,
  Crown,
  FirstAid,
  Fish,
  Hammer,
  Lightning,
  PottedPlant,
  ShieldStar,
  SlidersHorizontal,
  Skull,
  Sparkle,
  Storefront,
  Sword,
  Target,
  TestTube,
  Toolbox,
  Trophy,
  UserCircle,
  Warehouse,
  type Icon,
} from "@phosphor-icons/react";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { useEscapeKey } from "@/lib/useEscapeKey";
import type { SettlementBuildingId } from "@/adventure/data/v2/settlement";
import {
  GUILD_FACILITY_ICON_COLORS,
  GUILD_FACILITY_LABELS,
  availableGuildFacilityIds,
  type GuildFacilityId,
} from "./guild/guildFacilities";
import { useAdventureDashboard } from "./AdventureDashboardProvider";
import type { AdventureActivityView } from "./adventureDashboard";

// 메인 내비 — 가로 6탭(모험/전투/마을/생활/캐릭터/길드). 하위 메뉴가 있는 탭은 누르면
// 드롭다운으로 내려온다. 길드는 기존 길드 화면 + 준비된 기본 시설을 동적으로 노출한다.
// 색·활성 표기는 기존 탭바(highlight)와 동일한 인디고 언어. 드롭다운 항목은 각 탭 홈 카드와
// 같은 아이콘·색을 재사용해 일관·깔끔하게 보이도록 한다.

type SubItem = {
  label: string;
  href: string;
  activityHrefs?: readonly string[];
  Icon: Icon;
  color: string;
};
type TabDef = { key: string; label: string; href: string; sub?: SubItem[] };

const GUILD_ROOT_ITEM: SubItem = {
  label: "길드",
  href: "/guild",
  Icon: ShieldStar,
  color: "text-indigo-600 dark:text-indigo-400",
};

const GUILD_RAID_ITEM: SubItem = {
  label: "토벌전",
  href: "/guild?tab=raid",
  Icon: Crown,
  color: "text-rose-600 dark:text-rose-400",
};

// 길드 메뉴 전용 아이콘·색. 다른 메인 드롭다운 항목과 아이콘을 공유하지 않으며,
// 시설끼리도 색이 겹치지 않아 작은 화면에서도 형태와 색으로 함께 구분된다.
const GUILD_FACILITY_VISUALS: Record<
  GuildFacilityId,
  Pick<SubItem, "Icon">
> = {
  guild_smithy: {
    Icon: Toolbox,
  },
  training_ground: {
    Icon: Target,
  },
  exploration_hq: {
    Icon: Binoculars,
  },
  alchemy_workshop: {
    Icon: TestTube,
  },
  dining_hall: {
    Icon: BowlFood,
  },
  trade_post: {
    Icon: Storefront,
  },
  guild_warehouse: {
    Icon: Warehouse,
  },
};

function guildFacilityMenuItem(id: GuildFacilityId): SubItem {
  return {
    label: GUILD_FACILITY_LABELS[id],
    href: `/guild?tab=facilities&facility=${id}`,
    color: GUILD_FACILITY_ICON_COLORS[id],
    ...GUILD_FACILITY_VISUALS[id],
  };
}

export function guildMenuItemsForViewer(
  viewerGuildId: number | null,
  facilityIds: readonly GuildFacilityId[] = [],
): SubItem[] {
  if (viewerGuildId == null) return [GUILD_ROOT_ITEM];
  return [
    GUILD_ROOT_ITEM,
    GUILD_RAID_ITEM,
    ...facilityIds.map(guildFacilityMenuItem),
  ];
}

export const TOWN_MENU_ITEMS = [
  { label: "모험가 협회", href: "/town/association", Icon: Buildings, color: "text-indigo-600" },
  { label: "치료소", href: "/town/healing", Icon: FirstAid, color: "text-rose-500" },
  { label: "은행", href: "/town/bank", Icon: Bank, color: "text-yellow-600" },
  { label: "통합 교환소", href: "/town/exchange", Icon: Storefront, color: "text-orange-600" },
  { label: "대장간", href: "/town/smithy", Icon: Hammer, color: "text-amber-600" },
] satisfies SubItem[];

export const LIFE_MENU_ITEMS = [
  {
    label: "생활 지도",
    href: "/map",
    activityHrefs: ["/town/logging", "/town/mining"],
    Icon: Compass,
    color: "text-sky-600",
  },
  { label: "생활 의뢰·조합 작업장", href: "/town/life-workshop", Icon: Toolbox, color: "text-amber-600" },
  { label: "모험가 농장", href: "/town/farm", Icon: PottedPlant, color: "text-emerald-500" },
  { label: "낚시", href: "/town/fishing", Icon: Fish, color: "text-sky-500" },
  { label: "주방", href: "/town/kitchen", Icon: CookingPot, color: "text-amber-600" },
] satisfies SubItem[];

function activityMenuText(
  activity: AdventureActivityView,
  menuLabel: string,
): string {
  return menuLabel.length === 0 || activity.title === menuLabel
    ? activity.detail
    : `${activity.title} · ${activity.detail}`;
}

export function menuActivityStateForHref(
  activities: readonly AdventureActivityView[],
  href: string,
  menuLabel: string,
  activityHrefs: readonly string[] = [],
): { text: string; actionable: boolean } | null {
  const matchingHrefs = new Set([href, ...activityHrefs]);
  const candidates = activities.filter(
    (activity) => activity.enabled && matchingHrefs.has(activity.href),
  );
  if (candidates.length === 0) return null;
  const actionable = candidates.filter(
    (activity) => activity.state === "actionable",
  );
  if (actionable.length > 0) {
    return {
      text: actionable
        .map((activity) => activityMenuText(activity, menuLabel))
        .join(" / "),
      actionable: true,
    };
  }
  const ranked = candidates
    .map((activity, index) => ({
      activity,
      index,
      priority:
        activity.state === "actionable"
          ? 0
          : activity.current != null && activity.target != null && activity.state !== "completed"
            ? 1
            : activity.readyAt != null && activity.state === "in_progress"
              ? 2
              : 3,
    }))
    .sort((a, b) => a.priority - b.priority || a.index - b.index);
  const activity = ranked[0]?.activity;
  return activity
    ? {
        text: activityMenuText(activity, menuLabel),
        actionable: false,
      }
    : null;
}

export function lifeMenuStateForHref(
  activities: readonly AdventureActivityView[],
  href: string,
): { text: string; actionable: boolean } | null {
  return menuActivityStateForHref(activities, href, "");
}

export function townMenuItemsForViewer(
  viewerGuildId: number | null,
  gameStateLoaded = true,
): SubItem[] {
  return gameStateLoaded && viewerGuildId == null
    ? TOWN_MENU_ITEMS
    : TOWN_MENU_ITEMS.filter((item) => item.href !== "/town/association");
}

export const CHARACTER_MENU_ITEMS = [
  { label: "내 정보", href: "/character/info", Icon: UserCircle, color: "text-amber-500" },
  { label: "인벤토리", href: "/character/inventory", Icon: Backpack, color: "text-emerald-600" },
  { label: "스킬", href: "/character/skills", Icon: Lightning, color: "text-violet-500" },
  {
    label: "전투 프리셋",
    href: "/character/presets",
    Icon: SlidersHorizontal,
    color: "text-emerald-500",
  },
  { label: "퀘스트", href: "/quests", Icon: Compass, color: "text-rose-400" },
  { label: "성장의 신전", href: "/character/shrine", Icon: Sparkle, color: "text-violet-400" },
  { label: "트로피 전시대", href: "/character/trophies", Icon: Trophy, color: "text-amber-600" },
  { label: "모험의 서", href: "/character/codex", Icon: BookOpen, color: "text-sky-500" },
] satisfies SubItem[];

// 하위 항목·아이콘은 각 탭 홈(card 메뉴)에서 그대로 가져온 라우트/아이콘. 새 하위화면 추가 시 여기 한 줄.
const TABS: TabDef[] = [
  {
    key: "battle",
    label: "전투",
    href: "/battle",
    sub: [
      { label: "사냥터", href: "/battle/dungeon", Icon: Sword, color: "text-rose-500" },
      { label: "협동 보스", href: "/battle/coop", Icon: Skull, color: "text-rose-500" },
      { label: "아레나", href: "/battle/arena", Icon: Trophy, color: "text-amber-500" },
      { label: "대련장", href: "/battle/sparring", Icon: BoxingGlove, color: "text-sky-500" },
      { label: "숙련의 탑", href: "/battle/mastery-tower", Icon: CastleTurret, color: "text-emerald-500" },
      { label: "원정", href: "/battle/storm-expedition", Icon: CloudLightning, color: "text-sky-500" },
    ],
  },
  {
    key: "town",
    label: "마을",
    href: "/town",
    sub: TOWN_MENU_ITEMS,
  },
  {
    key: "life",
    label: "생활",
    href: "/map",
    sub: LIFE_MENU_ITEMS,
  },
  {
    key: "character",
    label: "캐릭터",
    href: "/character",
    sub: CHARACTER_MENU_ITEMS,
  },
  { key: "guild", label: "길드", href: "/guild", sub: [GUILD_ROOT_ITEM] },
];

export function MainTabNav({
  activeKey,
  gameStateLoaded,
  onNavigate,
  viewerGuildId,
}: {
  // 현재 활성 탭 key(경로 파생). TABS 에 없는 값(예: plaza)이면 아무 탭도 강조 안 함.
  activeKey: string;
  gameStateLoaded: boolean;
  onNavigate: (href: string) => void;
  viewerGuildId: number | null;
}) {
  const { snapshot } = useAdventureDashboard();
  // 열린 드롭다운 탭 key — 한 번에 하나만. null=닫힘.
  const [openKey, setOpenKey] = useState<string | null>(null);
  const activeButtonRef = useRef<HTMLButtonElement>(null);
  const [guildFacilityCache, setGuildFacilityCache] = useState<{
    guildId: number;
    ids: GuildFacilityId[];
  } | null>(null);
  const guildFacilityRequest = useRef<number | null>(null);
  useEscapeKey(() => setOpenKey(null));
  useEffect(() => {
    activeButtonRef.current?.scrollIntoView({
      behavior: "auto",
      block: "nearest",
      inline: "nearest",
    });
  }, [activeKey]);
  const close = () => setOpenKey(null);

  async function refreshGuildFacilities(guildId: number) {
    if (guildFacilityRequest.current === guildId) return;
    guildFacilityRequest.current = guildId;
    try {
      const res = await fetch("/api/v2/me/guild/info");
      if (!res.ok) return;
      const json = (await res.json()) as {
        settlementBuildings?: Partial<Record<SettlementBuildingId, number>>;
      };
      setGuildFacilityCache({
        guildId,
        ids: availableGuildFacilityIds(json.settlementBuildings),
      });
    } catch {
      // 조회 실패 시 기존 캐시(또는 길드 기본 항목)만 유지한다.
    } finally {
      if (guildFacilityRequest.current === guildId) {
        guildFacilityRequest.current = null;
      }
    }
  }

  const openTab = TABS.find((t) => t.key === openKey && t.sub);
  const cachedGuildFacilityIds =
    guildFacilityCache?.guildId === viewerGuildId
      ? guildFacilityCache.ids
      : [];
  const openSubItems =
    openTab?.key === "guild"
      ? guildMenuItemsForViewer(viewerGuildId, cachedGuildFacilityIds)
      : openTab?.key === "town"
        ? townMenuItemsForViewer(viewerGuildId, gameStateLoaded)
      : (openTab?.sub ?? []);

  return (
    <nav className="relative w-full" aria-label="메인 메뉴">
      <div className="grid grid-cols-5 border-b border-zinc-200 px-1 sm:px-3 dark:border-zinc-800">
        {TABS.map((t) => {
          const isActive = t.key === activeKey;
          const hasSub = !!t.sub;
          const isOpen = openKey === t.key;
          const hasActionable = snapshot?.notifications.tabs[
            t.key as keyof typeof snapshot.notifications.tabs
          ] === true;
          return (
            <button
              key={t.key}
              ref={isActive ? activeButtonRef : undefined}
              type="button"
              aria-haspopup={hasSub ? "menu" : undefined}
              aria-expanded={hasSub ? isOpen : undefined}
              onClick={() => {
                if (hasSub) {
                  const nextOpen = isOpen ? null : t.key;
                  setOpenKey(nextOpen);
                  if (nextOpen === "guild" && viewerGuildId != null) {
                    void refreshGuildFacilities(viewerGuildId);
                  }
                } else {
                  close();
                  onNavigate(t.href);
                }
              }}
              aria-label={`${t.label}${hasActionable ? ", 처리 가능한 항목 있음" : ""}`}
              className={`relative -mb-px flex min-h-11 min-w-0 items-center justify-center gap-0.5 whitespace-nowrap border-b-2 px-0.5 py-2 text-sm font-semibold transition-colors sm:gap-1 sm:px-2 ${
                isActive
                  ? "border-violet-600 text-violet-700 dark:border-violet-400 dark:text-violet-300"
                  : "border-transparent text-zinc-500 hover:text-violet-600 dark:text-zinc-400 dark:hover:text-violet-300"
              }`}
            >
              {t.label}
              {hasActionable && (
                <span
                  aria-hidden
                  className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-orange-500 ring-2 ring-white dark:ring-zinc-950"
                />
              )}
              {hasSub && (
                <CaretDown
                  size={10}
                  weight="bold"
                  className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              )}
            </button>
          );
        })}
      </div>

      {openTab && (
        <>
          {/* 바깥 클릭 닫기 — 투명 캐처. */}
          <div className="fixed inset-0 z-40" onClick={close} aria-hidden />
          <div
            key={openTab.key}
            role="menu"
            aria-label={`${openTab.label} 메뉴`}
            className={`${SURFACE_CARD} ui-dropdown-reveal absolute left-0 right-0 top-full z-50 mx-2 mt-2 grid max-h-[calc(100dvh-10rem)] grid-cols-2 gap-1 overflow-y-auto overscroll-contain p-2 sm:mx-6 sm:grid-cols-3`}
          >
            {openSubItems.map((s) => {
              const activityState = menuActivityStateForHref(
                snapshot?.activities ?? [],
                s.href,
                s.label,
                s.activityHrefs,
              );
              const notificationHrefs = [s.href, ...(s.activityHrefs ?? [])];
              const hasActionable =
                activityState?.actionable === true &&
                notificationHrefs.some(
                  (href) => snapshot?.notifications.paths[href] === true,
                );
              return (
              <button
                key={s.href}
                type="button"
                role="menuitem"
                onClick={() => {
                  close();
                  onNavigate(s.href);
                }}
                aria-label={`${s.label}${hasActionable ? ", 처리 가능한 항목 있음" : ""}`}
                className={`${SURFACE_INSET} relative flex h-14 items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-zinc-100 active:bg-zinc-200 dark:hover:bg-zinc-900 dark:active:bg-zinc-800`}
              >
                <s.Icon
                  size={20}
                  weight="duotone"
                  aria-hidden
                  className={`shrink-0 ${s.color}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-zinc-700 dark:text-zinc-200">
                    {s.label}
                  </span>
                  {activityState && (
                    <span className={`block truncate text-[0.6875rem] ${hasActionable ? "font-semibold text-orange-700 dark:text-orange-300" : "text-zinc-500 dark:text-zinc-400"}`}>
                      {activityState.text}
                    </span>
                  )}
                </span>
                {hasActionable && (
                  <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-orange-500" />
                )}
              </button>
              );
            })}
          </div>
        </>
      )}
    </nav>
  );
}
