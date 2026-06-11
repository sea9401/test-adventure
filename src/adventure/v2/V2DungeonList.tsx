"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { BackButton } from "@/components/ui/BackButton";
import { HeaderPanel } from "@/components/ui/HeaderPanel";
import { depthName, dungeonThemeGroups } from "@/adventure/data/v2/dungeon";
import { floorPowerGate } from "@/adventure/data/v2/dungeonLadder";
import {
  getThemeBossDef,
  themeStartDepth,
  bossRecommendedPower,
} from "@/adventure/data/v2/dungeonBosses";

// 무한 프론티어 사냥터 목록 — 2단. 테마(들판·깊은 산·…) 카드 → 누르면 그 안에서 깊이 카드 6개.
// 뒤로 갈수록 깊이가 한 화면에 너무 많아지는 걸 테마별로 접어 해소. frontierDepth = 최고 도달
// 깊이(기본 2). 그 이상은 "도전(미정복)" 구역(= maxDepth+1).

export function V2DungeonList({
  currentOutpost,
  onSelectFloor,
  onOpenMap,
  frontierDepth = 2,
  onSelectBoss,
}: {
  currentOutpost: { id: string; name: string } | null;
  onSelectFloor: (depth: number) => void;
  onOpenMap: () => void;
  frontierDepth?: number;
  // 테마 보스 도전 — 그 테마 보스의 대표 깊이(themeStartDepth)로 호출. 미전달이면 버튼 숨김.
  onSelectBoss?: (depth: number) => void;
}) {
  const maxDepth = Math.max(2, frontierDepth);
  const challengeDepth = maxDepth + 1; // 도전(미정복)
  // 깊이 1 ~ 도전까지를 테마 블록(≤6깊이)으로 묶는다.
  const groups = dungeonThemeGroups(challengeDepth);
  // 열린 테마 — 블록의 첫 깊이로 식별(배열 인덱스보다 안정적, frontierDepth 변동에도 견고).
  const [openDepth, setOpenDepth] = useState<number | null>(null);
  const openGroup =
    openDepth != null
      ? (groups.find((g) => g.depths[0] === openDepth) ?? null)
      : null;
  // 열린 테마의 보스(있으면) — 보스 도전 버튼 표시용. depths[0] = 테마 시작 깊이.
  const openGroupBoss = openGroup ? getThemeBossDef(openGroup.depths[0]) : null;

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <HeaderPanel>
        <BackButton onClick={openGroup ? () => setOpenDepth(null) : onOpenMap} />
        <h1 className="mt-3 text-lg font-bold">
          {openGroup ? openGroup.name : "사냥터"}
        </h1>
        {!currentOutpost && (
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            거점에 머문 적이 없어요. 지도에서 거점 진입 후 사냥 가능.
          </p>
        )}
      </HeaderPanel>

      {!currentOutpost ? (
        <Card padding="md">
          <button
            type="button"
            onClick={onOpenMap}
            className="rounded-md border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            지도 열기
          </button>
        </Card>
      ) : openGroup ? (
        // 이너 — 선택한 테마의 깊이 카드 6개 + (보스 있는 테마면) 보스 도전.
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {openGroup.depths.map((depth) => (
              <DepthCard
                key={depth}
                depth={depth}
                isChallenge={depth === challengeDepth}
                onSelect={onSelectFloor}
              />
            ))}
          </div>
          {onSelectBoss && openGroupBoss && (
            <button
              type="button"
              onClick={() => onSelectBoss(themeStartDepth(openGroup.depths[0]))}
              className="block w-full rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 text-left transition hover:border-amber-500 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:hover:bg-amber-950/60"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                  ⚔ {openGroupBoss.name} 도전
                </span>
                <span className="shrink-0 text-[11px] text-amber-700 dark:text-amber-400">
                  권장 전투력 {bossRecommendedPower(openGroup.depths[0])}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-amber-700/80 dark:text-amber-400/80">
                이 테마의 보스 — 전용 유니크 + 첫 처치 칭호.
              </p>
            </button>
          )}
        </div>
      ) : (
        // 테마(사냥터) 카드.
        <div className="grid grid-cols-2 gap-2">
          {groups.map((g) => {
            const hasChallenge = g.depths.includes(challengeDepth);
            const from = g.depths[0];
            const to = g.depths[g.depths.length - 1];
            return (
              <button
                key={from}
                type="button"
                onClick={() => setOpenDepth(from)}
                className="group block h-full text-left"
              >
                <Card
                  padding="sm"
                  className={`flex h-full flex-col transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-sm ${
                    hasChallenge
                      ? "border-amber-400 hover:border-amber-500 dark:border-amber-600 dark:hover:border-amber-400"
                      : "hover:border-rose-300 dark:hover:border-rose-600"
                  }`}
                >
                  <div
                    className={`truncate text-sm font-medium transition-colors ${
                      hasChallenge
                        ? "text-amber-700 dark:text-amber-400 group-hover:text-amber-800 dark:group-hover:text-amber-300"
                        : "group-hover:text-rose-600 dark:group-hover:text-rose-400"
                    }`}
                  >
                    {g.name}
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {from === to ? `깊이 ${from}` : `깊이 ${from}~${to}`}
                  </div>
                  {hasChallenge && (
                    <div className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                      도전 구역 포함
                    </div>
                  )}
                  <span
                    className={`mt-2 self-start rounded px-2 py-0.5 text-xs transition-colors ${
                      hasChallenge
                        ? "bg-amber-100 text-amber-800 group-hover:bg-amber-500 group-hover:text-white dark:bg-amber-900 dark:text-amber-100 dark:group-hover:bg-amber-600"
                        : "bg-zinc-200 text-zinc-700 group-hover:bg-rose-500 group-hover:text-white dark:bg-zinc-800 dark:text-zinc-200 dark:group-hover:bg-rose-600"
                    }`}
                  >
                    열기
                  </span>
                </Card>
              </button>
            );
          })}
        </div>
      )}
    </main>
  );
}

// 깊이 1개 카드 — 입장. (이너 뷰에서 테마의 각 깊이.)
function DepthCard({
  depth,
  isChallenge,
  onSelect,
}: {
  depth: number;
  isChallenge: boolean;
  onSelect: (depth: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(depth)}
      className="group block h-full text-left"
    >
      <Card
        padding="sm"
        className={`flex h-full flex-col transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-sm ${
          isChallenge
            ? "border-amber-400 hover:border-amber-500 dark:border-amber-600 dark:hover:border-amber-400"
            : "hover:border-rose-300 dark:hover:border-rose-600"
        }`}
      >
        <div
          className={`truncate text-sm font-medium transition-colors ${
            isChallenge
              ? "text-amber-700 dark:text-amber-400 group-hover:text-amber-800 dark:group-hover:text-amber-300"
              : "group-hover:text-rose-600 dark:group-hover:text-rose-400"
          }`}
        >
          {depthName(depth)}
        </div>
        <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          권장 전투력 {floorPowerGate(depth)}
        </div>
        {isChallenge && (
          <div className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-400">
            도전 (미정복)
          </div>
        )}
        <span
          className={`mt-2 self-start rounded px-2 py-0.5 text-xs transition-colors ${
            isChallenge
              ? "bg-amber-100 text-amber-800 group-hover:bg-amber-500 group-hover:text-white dark:bg-amber-900 dark:text-amber-100 dark:group-hover:bg-amber-600"
              : "bg-zinc-200 text-zinc-700 group-hover:bg-rose-500 group-hover:text-white dark:bg-zinc-800 dark:text-zinc-200 dark:group-hover:bg-rose-600"
          }`}
        >
          입장
        </span>
      </Card>
    </button>
  );
}
