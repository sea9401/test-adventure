"use client";

import { useState } from "react";
import {
  Backpack,
  Bank,
  Barbell,
  BookOpen,
  CaretDown,
  CastleTurret,
  Compass,
  Fish,
  FirstAid,
  Hammer,
  Lightning,
  MagnifyingGlass,
  PottedPlant,
  Skull,
  Sparkle,
  Storefront,
  Sword,
  Trophy,
  UserCircle,
  type Icon,
} from "@phosphor-icons/react";
import { SURFACE_CARD } from "@/components/ui/surfaces";
import { useEscapeKey } from "@/lib/useEscapeKey";

// 메인 내비 — 가로 5탭(모험/전투/마을/캐릭터/길드). 하위 메뉴가 있는 탭(전투·마을·캐릭터)은
// 누르면 그 탭의 하위 화면이 드롭다운으로 내려온다(사용자 요청). 모험·길드는 하위 메뉴 없이
// 바로 이동(모험=상태 대시보드, 길드=가입상태/권한별 화면이라 단순 메뉴화 부적합).
// 색·활성 표기는 기존 탭바(highlight)와 동일한 인디고 언어. 드롭다운 항목은 각 탭 홈 카드와
// 같은 아이콘·색을 재사용해 일관·깔끔하게 보이도록 한다.

type SubItem = { label: string; href: string; Icon: Icon; color: string };
type TabDef = { key: string; label: string; href: string; sub?: SubItem[] };

// 하위 항목·아이콘은 각 탭 홈(card 메뉴)에서 그대로 가져온 라우트/아이콘. 새 하위화면 추가 시 여기 한 줄.
const TABS: TabDef[] = [
  { key: "adventure", label: "모험", href: "/" },
  {
    key: "battle",
    label: "전투",
    href: "/battle",
    sub: [
      { label: "사냥터", href: "/battle/dungeon", Icon: Sword, color: "text-rose-500" },
      { label: "협동 보스", href: "/battle/coop", Icon: Skull, color: "text-rose-500" },
      { label: "아레나", href: "/battle/arena", Icon: Trophy, color: "text-amber-500" },
      { label: "훈련장", href: "/battle/sparring", Icon: Barbell, color: "text-sky-500" },
      { label: "숙련의 탑", href: "/battle/mastery-tower", Icon: CastleTurret, color: "text-emerald-500" },
    ],
  },
  {
    key: "town",
    label: "마을",
    href: "/town",
    sub: [
      { label: "치료소", href: "/town/healing", Icon: FirstAid, color: "text-rose-500" },
      { label: "은행", href: "/town/bank", Icon: Bank, color: "text-yellow-600" },
      { label: "상점", href: "/town/shop", Icon: Storefront, color: "text-emerald-600" },
      { label: "대장간", href: "/town/smithy", Icon: Hammer, color: "text-amber-600" },
      { label: "낚시터", href: "/town/fishing", Icon: Fish, color: "text-cyan-500" },
      { label: "모험가 농장", href: "/town/farm", Icon: PottedPlant, color: "text-emerald-500" },
      { label: "발굴 감정소", href: "/town/treasure", Icon: MagnifyingGlass, color: "text-amber-500" },
    ],
  },
  {
    key: "character",
    label: "캐릭터",
    href: "/character",
    sub: [
      { label: "내 정보", href: "/character/info", Icon: UserCircle, color: "text-amber-500" },
      { label: "인벤토리", href: "/character/inventory", Icon: Backpack, color: "text-emerald-600" },
      { label: "스킬", href: "/character/skills", Icon: Lightning, color: "text-violet-500" },
      { label: "퀘스트", href: "/quests", Icon: Compass, color: "text-rose-400" },
      { label: "성장의 신전", href: "/character/shrine", Icon: Sparkle, color: "text-violet-400" },
      { label: "모험의 서", href: "/character/codex", Icon: BookOpen, color: "text-sky-500" },
    ],
  },
  { key: "guild", label: "길드", href: "/guild" },
];

export function MainTabNav({
  activeKey,
  onNavigate,
}: {
  // 현재 활성 탭 key(경로 파생). TABS 에 없는 값(예: plaza)이면 아무 탭도 강조 안 함.
  activeKey: string;
  onNavigate: (href: string) => void;
}) {
  // 열린 드롭다운 탭 key — 한 번에 하나만. null=닫힘.
  const [openKey, setOpenKey] = useState<string | null>(null);
  useEscapeKey(() => setOpenKey(null));
  const close = () => setOpenKey(null);

  const openTab = TABS.find((t) => t.key === openKey && t.sub);

  return (
    <nav className="relative mx-auto w-full max-w-[720px]" aria-label="메인 메뉴">
      <div className="flex gap-0.5 overflow-x-auto border-b border-zinc-200 px-2 sm:px-6 dark:border-zinc-800">
        {TABS.map((t) => {
          const isActive = t.key === activeKey;
          const hasSub = !!t.sub;
          const isOpen = openKey === t.key;
          return (
            <button
              key={t.key}
              type="button"
              aria-haspopup={hasSub ? "menu" : undefined}
              aria-expanded={hasSub ? isOpen : undefined}
              onClick={() => {
                if (hasSub) {
                  setOpenKey(isOpen ? null : t.key);
                } else {
                  close();
                  onNavigate(t.href);
                }
              }}
              className={`flex shrink-0 items-center gap-1 whitespace-nowrap px-3 py-2.5 text-[1.0625rem] font-semibold transition-colors sm:px-5 ${
                isActive
                  ? "text-indigo-700 dark:text-indigo-300"
                  : "text-zinc-500 hover:text-indigo-500 dark:text-zinc-400 dark:hover:text-indigo-400"
              }`}
            >
              {t.label}
              {hasSub && (
                <CaretDown
                  size={13}
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
            role="menu"
            aria-label={`${openTab.label} 메뉴`}
            className={`${SURFACE_CARD} absolute left-0 right-0 top-full z-50 mx-2 mt-2 grid grid-cols-2 gap-1 p-2 sm:mx-6`}
          >
            {openTab.sub!.map((s) => (
              <button
                key={s.href}
                type="button"
                role="menuitem"
                onClick={() => {
                  close();
                  onNavigate(s.href);
                }}
                className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-zinc-100 active:bg-zinc-200 dark:hover:bg-zinc-800/70 dark:active:bg-zinc-800"
              >
                <s.Icon
                  size={20}
                  weight="duotone"
                  aria-hidden
                  className={`shrink-0 ${s.color}`}
                />
                <span className="truncate text-sm font-medium text-zinc-700 dark:text-zinc-200">
                  {s.label}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </nav>
  );
}
