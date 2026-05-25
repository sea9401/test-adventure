"use client";

import {
  MapTrifold,
  Storefront,
  Sword,
  User,
  type Icon,
} from "@phosphor-icons/react";

// v2 메인 4탭 — V2TopBar 바로 아래 sticky. 라이브 게임 톤.
// 모험·마을·캐릭터·지도. 클릭 시 그 탭의 default sub-view 로 jump.

export type TabId = "adventure" | "town" | "character" | "map";

const TABS: { id: TabId; label: string; Icon: Icon }[] = [
  { id: "adventure", label: "모험", Icon: Sword },
  { id: "town", label: "마을", Icon: Storefront },
  { id: "character", label: "캐릭터", Icon: User },
  { id: "map", label: "지도", Icon: MapTrifold },
];

export function V2TabBar({
  current,
  onSelect,
}: {
  current: TabId;
  onSelect: (tab: TabId) => void;
}) {
  return (
    <nav className="sticky top-[44px] z-10 flex border-b border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
      {TABS.map(({ id, label, Icon }) => {
        const active = id === current;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className={`flex flex-1 flex-col items-center gap-0.5 border-b-2 px-2 py-2 text-xs transition-colors ${
              active
                ? "border-emerald-500 text-emerald-700 dark:text-emerald-400"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            <Icon
              size={20}
              weight={active ? "fill" : "duotone"}
              aria-hidden
            />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
