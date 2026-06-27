"use client";

import { useState } from "react";
import { CaretDown } from "@phosphor-icons/react";
import { useEscapeKey } from "@/lib/useEscapeKey";

// 메인 내비 — 가로 5탭(모험/전투/마을/캐릭터/길드). 하위 메뉴가 있는 탭(전투·마을·캐릭터)은
// 누르면 그 탭의 하위 화면이 드롭다운으로 내려온다(사용자 요청). 모험·길드는 하위 메뉴 없이
// 바로 이동(모험=상태 대시보드, 길드=가입상태/권한별 화면이라 단순 메뉴화 부적합).
// 색·활성 표기는 기존 탭바(highlight)와 동일한 인디고 언어.

type SubItem = { label: string; href: string };
type TabDef = { key: string; label: string; href: string; sub?: SubItem[] };

// 하위 항목은 각 탭 홈(card 메뉴)에서 그대로 가져온 라우트. 새 하위화면 추가 시 여기 한 줄.
const TABS: TabDef[] = [
  { key: "adventure", label: "모험", href: "/" },
  {
    key: "battle",
    label: "전투",
    href: "/battle",
    sub: [
      { label: "사냥터", href: "/battle/dungeon" },
      { label: "협동 보스", href: "/battle/coop" },
      { label: "아레나", href: "/battle/arena" },
      { label: "훈련장", href: "/battle/sparring" },
      { label: "토벌", href: "/battle/subjugation" },
      { label: "지도", href: "/map" },
    ],
  },
  {
    key: "town",
    label: "마을",
    href: "/town",
    sub: [
      { label: "치료소", href: "/town/healing" },
      { label: "은행", href: "/town/bank" },
      { label: "상점", href: "/town/shop" },
      { label: "대장간", href: "/town/smithy" },
      { label: "낚시터", href: "/town/fishing" },
      { label: "발굴 감정소", href: "/town/treasure" },
    ],
  },
  {
    key: "character",
    label: "캐릭터",
    href: "/character",
    sub: [
      { label: "내 정보", href: "/character/info" },
      { label: "인벤토리", href: "/character/inventory" },
      { label: "스킬", href: "/character/skills" },
      { label: "퀘스트", href: "/quests" },
      { label: "성장의 신전", href: "/character/shrine" },
      { label: "모험의 서", href: "/character/codex" },
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
          <div
            className="fixed inset-0 z-40"
            onClick={close}
            aria-hidden
          />
          <div
            role="menu"
            aria-label={`${openTab.label} 메뉴`}
            className="absolute left-0 right-0 top-full z-50 mx-2 mt-1 grid grid-cols-2 gap-1 rounded-lg border border-zinc-200 bg-white p-2 shadow-xl sm:mx-6 dark:border-zinc-800 dark:bg-zinc-950"
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
                className="rounded-md px-3 py-2.5 text-left text-sm font-medium text-zinc-700 transition-colors hover:bg-indigo-50 hover:text-indigo-700 dark:text-zinc-200 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-300"
              >
                {s.label}
              </button>
            ))}
          </div>
        </>
      )}
    </nav>
  );
}
