"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { GameIcon } from "@/adventure/v2/GameIcon";
import { RareMapCountdownText } from "@/adventure/v2/RareMapCountdownText";
import { huntStageName } from "@/adventure/data/v2/dungeon";
import {
  RARE_MAP_KINDS,
  type RareMapInstance,
} from "@/adventure/data/v2/rareMaps";

export function sortHuntRareMaps(
  maps: readonly RareMapInstance[],
): RareMapInstance[] {
  return maps
    .filter((map) => RARE_MAP_KINDS[map.kind]?.category === "hunt")
    .slice()
    .sort((a, b) => a.foundAt - b.foundAt || a.iid.localeCompare(b.iid));
}

export function heldRareMapsAfterExpedition(
  maps: readonly RareMapInstance[],
  activeIid: string,
  won: boolean,
): RareMapInstance[] {
  return won ? maps.filter((map) => map.iid !== activeIid) : [...maps];
}

export function RareMapQuickEntry({
  maps,
  serverNow,
  onEnter,
  onExpire,
  nextLabel = false,
  className = "mt-2",
}: {
  maps: readonly RareMapInstance[];
  serverNow: number | null;
  onEnter: (map: RareMapInstance) => void;
  onExpire?: (map: RareMapInstance) => void;
  nextLabel?: boolean;
  className?: string;
}) {
  const [otherMapsOpen, setOtherMapsOpen] = useState(false);
  const huntMaps = sortHuntRareMaps(maps);
  const primary = huntMaps[0];
  if (!primary) return null;

  const primaryDef = RARE_MAP_KINDS[primary.kind];
  return (
    <Card
      padding="sm"
      data-rare-map-quick-entry
      className={`${className} border-amber-400 dark:border-amber-700`}
    >
      <button
        type="button"
        onClick={() => onEnter(primary)}
        className="ui-game-button flex w-full items-center justify-center gap-2 rounded-md border border-amber-500 bg-amber-500 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-600"
      >
        <GameIcon name="Sparkle" size={17} className="shrink-0" />
        {nextLabel ? "다음 희귀 탐사" : "희귀 탐사"} · {primaryDef.name}
      </button>
      <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 text-[11px] text-zinc-600 dark:text-zinc-300">
        <span>{huntStageName(primary.depth)} · 지도 {huntMaps.length}개</span>
        <span aria-hidden="true">·</span>
        <span>보상 {primary.runsLeft}회분</span>
        {serverNow != null && (
          <>
            <span aria-hidden="true">·</span>
            <RareMapCountdownText
              foundAt={primary.foundAt}
              serverNow={serverNow}
              onExpire={() => onExpire?.(primary)}
            />
          </>
        )}
      </div>
      {huntMaps.length > 1 && (
        <div className="mt-2 border-t border-zinc-200 pt-2 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => setOtherMapsOpen((open) => !open)}
            aria-expanded={otherMapsOpen}
            className="ui-game-button w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            다른 지도
          </button>
          {otherMapsOpen && (
            <div className="mt-1.5 grid gap-1.5">
              {huntMaps.slice(1).map((map) => (
                <button
                  key={map.iid}
                  type="button"
                  onClick={() => onEnter(map)}
                  className="ui-game-button rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-left text-xs text-sky-800 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200 dark:hover:bg-sky-900"
                >
                  <span className="block font-semibold">
                    {RARE_MAP_KINDS[map.kind].name}
                  </span>
                  <span className="mt-0.5 block text-[11px] opacity-80">
                    {huntStageName(map.depth)} · 보상 {map.runsLeft}회분
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
