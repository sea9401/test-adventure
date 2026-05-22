"use client";

import { useState } from "react";
import { MapView } from "@/adventure/MapView";
import { GameProvider, type GameCtx } from "@/adventure/GameContext";
import type { MapProgress } from "@/lib/map-progress";
import type { AdventureLog } from "@/adventure/log/storage";
import type { RegionId } from "@/adventure/data/world";

// MapView 가 useGame() 에서 실제로 읽는 건 addNotification / autoHunt.isDispatched 뿐.
// 나머지 거대한 GameCtx 필드는 이 프리뷰에서 안 쓰므로 최소 stub 후 캐스팅.
const mockGameCtx = {
  addNotification: (_kind: string, text: string) => {
    // 프리뷰에선 토스트 인프라가 없으니 콘솔로만.
    console.log("[preview notification]", text);
  },
  autoHunt: { isDispatched: false },
} as unknown as GameCtx;

const emptyLog: AdventureLog = { monsters: {}, towns: {}, npcs: {}, titles: {} };

// 시나리오 — 어디에 서 있고 어떤 스토리 플래그를 가졌는지.
type Scenario = {
  label: string;
  currentRegionId: RegionId;
  flags: string[];
  note: string;
};

const SCENARIOS: Scenario[] = [
  {
    label: "깊은 동굴 · 보스 미처치",
    currentRegionId: "deep_cave",
    flags: ["jimmy_deep_cave_quest"],
    note: "별빛 갱도 게이트가 잠금(🔒) + 사유로 떠야 함.",
  },
  {
    label: "깊은 동굴 · 창공의 주재 처치",
    currentRegionId: "deep_cave",
    flags: ["jimmy_deep_cave_quest", "endgame_apex_defeated"],
    note: "별빛 갱도로 건너가기 버튼이 떠야 함. 누르면 별빛 맵으로 전환.",
  },
  {
    label: "별빛 갱도 (별빛 맵)",
    currentRegionId: "starfall_cave",
    flags: ["jimmy_deep_cave_quest", "endgame_apex_defeated"],
    note: "본토로 되돌아가는 게이트(자유 통과)가 떠야 함.",
  },
  {
    label: "시작 마을 (게이트 없음)",
    currentRegionId: "village",
    flags: [],
    note: "크로스맵 게이트가 없어 배너가 안 떠야 함.",
  },
];

export function MapPreview({ initialScenario = 0 }: { initialScenario?: number }) {
  // ?scenario=N 딥링크 → 초기 시나리오. 범위 밖이면 0.
  const startIdx =
    Number.isInteger(initialScenario) &&
    initialScenario >= 0 &&
    initialScenario < SCENARIOS.length
      ? initialScenario
      : 0;
  const [scenarioIdx, setScenarioIdx] = useState(startIdx);
  const scenario = SCENARIOS[scenarioIdx];

  // 시나리오 전환 시 progress 를 리셋. 방문 지역은 넉넉히 포함(되돌아가기 게이트 평가용).
  const [progress, setProgress] = useState<MapProgress>(() =>
    initialFor(SCENARIOS[startIdx]),
  );

  const selectScenario = (idx: number) => {
    setScenarioIdx(idx);
    setProgress(initialFor(SCENARIOS[idx]));
  };

  const flagSet = new Set(scenario.flags);

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <strong>DEV 프리뷰</strong> — 로그인·DB 없이 MapView 만 렌더. 운영 빌드에선 404.
      </div>

      <div className="space-y-2">
        <div className="text-xs font-medium text-zinc-500">시나리오</div>
        <div className="flex flex-wrap gap-2">
          {SCENARIOS.map((s, i) => (
            <button
              key={s.label}
              type="button"
              onClick={() => selectScenario(i)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                i === scenarioIdx
                  ? "bg-indigo-600 text-white"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          기대: {scenario.note} · 현재 위치(상태): {progress.currentRegionId}
        </p>
      </div>

      <GameProvider value={mockGameCtx}>
        <MapView
          progress={progress}
          onProgressChange={setProgress}
          log={emptyLog}
          playerHp={100}
          isTrialCleared={() => true}
          hasStoryFlag={(id) => flagSet.has(id)}
          onTrialStart={() => {}}
        />
      </GameProvider>
    </div>
  );
}

function initialFor(s: Scenario): MapProgress {
  // 되돌아가기 게이트(visited)를 평가할 수 있도록 관련 지역을 방문 처리.
  const visited: RegionId[] = [
    "village",
    "cave",
    "deep_cave",
    "starfall_cave",
    "starlit_crossroads",
    s.currentRegionId,
  ];
  return {
    currentRegionId: s.currentRegionId,
    visitedRegionIds: Array.from(new Set(visited)),
    respawnRegionId: "village",
  };
}
