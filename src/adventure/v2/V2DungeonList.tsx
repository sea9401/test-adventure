"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import {
  dungeonHuntStageGroups,
  huntStageLabel,
  huntStageName,
  nextHuntStageDepth,
  MAX_FRONTIER_DEPTH,
} from "@/adventure/data/v2/dungeon";
import {
  RARE_MAP_KINDS,
  type RareMapInstance,
} from "@/adventure/data/v2/rareMaps";
import { floorPowerGate } from "@/adventure/data/v2/dungeonLadder";

// 프론티어 사냥터 목록 — 2단. 테마 카드 → 입구·심부·최심부의 3단계.
// 내부 깊이와 밸런스는 유지하고 각 두 깊이의 뒤쪽 값(2·4·6)을 대표 전투 깊이로 사용한다.

export const DUNGEON_THEME_VISIBILITY_STORAGE_KEY =
  "adventure.v2.dungeonThemeHiddenStarts";

export function V2DungeonList({
  onSelectFloor,
  onBack,
  frontierDepth = 2,
  playerPower = null,
  onSelectRareMap,
  initialOpenDepth = null,
}: {
  onSelectFloor: (depth: number) => void;
  // 상단 뒤로가기 — 진입 출처(전투 탭)로 복귀.
  onBack: () => void;
  frontierDepth?: number;
  playerPower?: number | null;
  // 희귀 탐사 입장 — 열린 탐사(iid·깊이)로 농축 사냥. 미전달이면 섹션 숨김.
  onSelectRareMap?: (map: RareMapInstance) => void;
  // 진입 시 자동으로 펼칠 테마 블록의 첫 깊이(사냥터에서 "뒤로"로 들어올 때). null=테마 목록부터.
  initialOpenDepth?: number | null;
}) {
  const maxDepth = Math.min(
    MAX_FRONTIER_DEPTH,
    Math.max(2, frontierDepth),
  );
  const challengeDepth = nextHuntStageDepth(maxDepth);
  const groups = dungeonHuntStageGroups(challengeDepth ?? maxDepth);
  // 열린 테마 — 기존 블록 첫 깊이(1·7·13)로 식별해 저장 설정과 돌아가기 링크를 보존한다.
  //   사냥터에서 "뒤로"로 진입 시(initialOpenDepth) 그 테마를 펼친 상태로 시작.
  const [openDepth, setOpenDepth] = useState<number | null>(initialOpenDepth);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hiddenThemeStarts, setHiddenThemeStarts] = useState<Set<number>>(
    () => new Set(),
  );
  const openGroup =
    openDepth != null
      ? (groups.find((g) => g.themeStartDepth === openDepth) ?? null)
      : null;
  const visibleGroups = groups.filter(
    (g) => !hiddenThemeStarts.has(g.themeStartDepth),
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = localStorage.getItem(DUNGEON_THEME_VISIBILITY_STORAGE_KEY);
        setHiddenThemeStarts(parseHiddenThemeStarts(raw));
      } catch {}
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function setHiddenThemes(next: Set<number>) {
    setHiddenThemeStarts(next);
    try {
      if (next.size === 0) {
        localStorage.removeItem(DUNGEON_THEME_VISIBILITY_STORAGE_KEY);
      } else {
        localStorage.setItem(
          DUNGEON_THEME_VISIBILITY_STORAGE_KEY,
          JSON.stringify([...next].sort((a, b) => a - b)),
        );
      }
    } catch {}
  }

  function toggleThemeVisibility(startDepth: number) {
    setHiddenThemes(toggleHiddenTheme(hiddenThemeStarts, startDepth));
  }

  // 열린 희귀 탐사 — 마운트 1회 조회(판수 소모와 30분 만료는 서버 권위).
  const [rareMaps, setRareMaps] = useState<RareMapInstance[]>([]);
  useEffect(() => {
    if (!onSelectRareMap) return;
    let alive = true;
    fetch("/api/v2/me/rare-maps")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { ok?: boolean; rareMaps?: RareMapInstance[] } | null) => {
        if (alive && j?.ok) {
          // hunt 계열만 — 입장권(비밀 상점/개명)은 인벤토리 소모품 탭에서 사용.
          setRareMaps(
            (j.rareMaps ?? []).filter(
              (m) => RARE_MAP_KINDS[m.kind]?.category === "hunt",
            ),
          );
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [onSelectRareMap]);

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader
        title={openGroup ? openGroup.name : "사냥터"}
        onBack={openGroup ? () => setOpenDepth(null) : onBack}
      />

      {openGroup ? (
        // 이너 — 선택한 테마의 입구·심부·최심부 카드.
        <div className="space-y-3">
          <PowerSummary playerPower={playerPower} />
          <div className="grid grid-cols-2 gap-2">
            {openGroup.depths.map((depth) => (
              <DepthCard
                key={depth}
                depth={depth}
                isChallenge={depth === challengeDepth}
                playerPower={playerPower}
                onSelect={onSelectFloor}
              />
            ))}
          </div>
        </div>
      ) : (
        // 테마(사냥터) 카드 (+위에 열린 희귀 탐사 섹션).
        <div className="space-y-3">
          <PowerSummary playerPower={playerPower} />
          <div className="flex items-center justify-between gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
            <span className="font-medium text-zinc-600 dark:text-zinc-300">
              표시 사냥터 {visibleGroups.length}/{groups.length}
            </span>
            <button
              type="button"
              onClick={() => setSettingsOpen((v) => !v)}
              className="rounded-md border border-zinc-300 px-2 py-1 font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              표시 설정
            </button>
          </div>
          {settingsOpen && (
            <Card padding="sm" className="space-y-2">
              <div className="grid gap-1.5 sm:grid-cols-2">
                {groups.map((g) => {
                  const startDepth = g.themeStartDepth;
                  const checked = !hiddenThemeStarts.has(startDepth);
                  return (
                    <label
                      key={startDepth}
                      className="flex cursor-pointer items-center justify-between gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-zinc-800 dark:text-zinc-100">
                          {g.name}
                        </span>
                        <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">
                          {stageRangeLabel(g.depths)}
                        </span>
                      </span>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleThemeVisibility(startDepth)}
                        className="h-4 w-4 shrink-0 accent-rose-600"
                      />
                    </label>
                  );
                })}
              </div>
              {hiddenThemeStarts.size > 0 && (
                <button
                  type="button"
                  onClick={() => setHiddenThemes(new Set())}
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  전체 표시
                </button>
              )}
            </Card>
          )}
          {onSelectRareMap && rareMaps.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                열린 희귀 탐사
              </div>
              {rareMaps.map((m) => (
                <button
                  key={m.iid}
                  type="button"
                  onClick={() => onSelectRareMap(m)}
                  className="flex w-full items-center justify-between gap-2 rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-left hover:bg-sky-100 dark:border-sky-700 dark:bg-sky-950/40 dark:hover:bg-sky-950/70"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-sky-800 dark:text-sky-200">
                      ✨ {RARE_MAP_KINDS[m.kind]?.name ?? m.kind} —{" "}
                      {huntStageName(m.depth)}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-sky-700/80 dark:text-sky-400/80">
                      남은 {m.runsLeft}판
                    </span>
                  </span>
                  <span className="shrink-0 rounded bg-sky-600 px-2 py-0.5 text-xs font-medium text-white">
                    입장
                  </span>
                </button>
              ))}
            </div>
          )}
          {visibleGroups.length === 0 ? (
            <Card padding="md">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  표시할 사냥터가 없습니다.
                </p>
                <button
                  type="button"
                  onClick={() => setHiddenThemes(new Set())}
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  전체 표시
                </button>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {visibleGroups.map((g) => {
                const hasChallenge =
                  challengeDepth != null && g.depths.includes(challengeDepth);
                const startDepth = g.themeStartDepth;
                return (
                  <button
                    key={startDepth}
                    type="button"
                    onClick={() => setOpenDepth(startDepth)}
                    className="group block h-full text-left"
                  >
                    <Card
                      padding="sm"
                      className={`ui-dungeon-card flex h-full flex-col transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-sm ${
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
                        {stageRangeLabel(g.depths)}
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
        </div>
      )}
    </main>
  );
}

export function toggleHiddenTheme(
  hidden: ReadonlySet<number>,
  startDepth: number,
): Set<number> {
  const next = new Set(hidden);
  if (next.has(startDepth)) next.delete(startDepth);
  else next.add(startDepth);
  return next;
}

export function parseHiddenThemeStarts(raw: string | null): Set<number> {
  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!Array.isArray(parsed)) return new Set();
    const next = new Set<number>();
    for (const value of parsed) {
      const n = Math.floor(Number(value));
      if (Number.isFinite(n) && n > 0) next.add(n);
    }
    return next;
  } catch {
    return new Set();
  }
}

export function stageRangeLabel(depths: readonly number[]): string {
  return depths.map(huntStageLabel).join(" · ");
}

// 사냥 단계 카드 — 내부 대표 깊이로 입장하지만 플레이어에게는 단계명만 보여준다.
function DepthCard({
  depth,
  isChallenge,
  playerPower,
  onSelect,
}: {
  depth: number;
  isChallenge: boolean;
  playerPower?: number | null;
  onSelect: (depth: number) => void;
}) {
  const requiredPower = floorPowerGate(depth);
  const powerGap =
    playerPower != null ? Math.round(playerPower - requiredPower) : null;
  return (
    <button
      type="button"
      onClick={() => onSelect(depth)}
      className="group block h-full text-left"
    >
      <Card
        padding="sm"
        className={`ui-dungeon-card flex h-full flex-col transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-sm ${
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
          {huntStageLabel(depth)}
        </div>
        <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          {playerPower != null
            ? `내 ${Math.round(playerPower).toLocaleString()} · 권장 ${requiredPower.toLocaleString()}`
            : `권장 전투력 ${requiredPower.toLocaleString()}`}
        </div>
        {powerGap != null && powerGap < 0 && (
          <div className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-400">
            전투력 {Math.abs(powerGap).toLocaleString()} 부족
          </div>
        )}
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

function PowerSummary({ playerPower }: { playerPower?: number | null }) {
  if (playerPower == null) return null;
  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-3">
        <span className="text-zinc-500 dark:text-zinc-400">내 전투력</span>
        <span className="text-sm font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
          {Math.round(playerPower).toLocaleString()}
        </span>
      </div>
    </div>
  );
}
