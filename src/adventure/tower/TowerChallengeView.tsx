"use client";

import { useState } from "react";
import { ArrowsClockwise, Crown, Skull, Star } from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import type { BattleState } from "@/adventure/battle/engine";
import {
  BattleScene,
  type BattlePlayerStatus,
} from "@/adventure/battle/BattleScene";
import type { Monster } from "@/adventure/data/monsters";
import { MONSTERS } from "@/adventure/data/monsters";
import { scaledStats } from "./scaling";
import { TOWER_CHALLENGE_MODIFIER } from "./challengeScaling";
import {
  BOSS_SLOTS,
  bossBaseMonster,
  bossDisplayName,
  bossSlotForFloor,
  mobPoolForFloor,
  pickMobFromPool,
} from "./floorPools";
import { TITLES } from "@/adventure/data/titles";
import {
  TOWER_CHALLENGE_DAILY_ATTEMPTS,
  TOWER_CHALLENGE_TITLE_FLOOR,
  TOWER_CHALLENGE_TITLE_ID,
  type TowerChallengeState,
} from "./challengeTypes";
import { todayKey } from "./dailyKey";
import {
  useTowerChallenge,
  type TowerChallengeApiResponse,
} from "./useTowerChallenge";

// 도전 모드 — 1.5× HP/ATK/DEF, 매번 F1, F50 보스 클리어 시 칭호. 자동 진행 / 마일스톤 / 드롭 없음.

type View =
  | { kind: "entry" }
  | { kind: "ready"; floor: number; enemy: Monster; isBoss: boolean }
  | {
      kind: "result";
      outcome: "win" | "lose";
      floor: number;
      enemy: Monster;
      finalState: BattleState;
      /** 이번 클리어로 처음 부여된 칭호 id (있으면 result 화면에 배너). */
      grantedTitleId?: string;
    }
  | { kind: "run_ended"; lastFloor: number };

export function TowerChallengeView({
  playerName,
  playerStatus,
  onApplied,
}: {
  playerName: string;
  playerStatus: BattlePlayerStatus;
  /** F50 칭호가 새로 부여되면 호출 — 부모에서 adventure-log.v2 동기화. */
  onApplied?: (r: TowerChallengeApiResponse) => void;
}) {
  const challenge = useTowerChallenge({ onApplied });
  const [view, setView] = useState<View>({ kind: "entry" });

  const state = challenge.state;
  const runActive = state.run !== null;

  return (
    <div className="space-y-3">
      <Card padding="md">
        <div className="mb-2 flex items-center gap-1.5 text-[11px]">
          <span className="rounded-full bg-rose-500/15 px-2 py-0.5 font-medium text-rose-700 dark:text-rose-300">
            도전 모드
          </span>
          <span className="text-zinc-500 dark:text-zinc-400">
            적 HP/ATK/DEF ×1.5. 매번 1층부터. F50 보스 클리어 시 칭호.
          </span>
        </div>
      </Card>

      {view.kind === "entry" && (
        <EntryView
          state={state}
          pending={challenge.pending}
          error={challenge.error}
          onStart={async () => {
            const r = await challenge.start();
            if (r.ok && r.challenge?.run) {
              setView(
                buildReady(r.challenge.run.currentFloor, r.challenge.run.upcomingEnemy),
              );
            }
          }}
          onResume={() => {
            if (state.run)
              setView(buildReady(state.run.currentFloor, state.run.upcomingEnemy));
          }}
          onForfeit={async () => {
            await challenge.forfeit();
          }}
        />
      )}

      {view.kind === "ready" && (
        <ReadyView
          floor={view.floor}
          enemy={view.enemy}
          isBoss={view.isBoss}
          disabled={challenge.pending !== null}
          onFight={async () => {
            const apiResult = await challenge.fightFloor();
            if (!apiResult.ok || !apiResult.battle) return;
            const outcome =
              apiResult.applied?.outcome === "lose" ? "lose" : "win";
            setView({
              kind: "result",
              outcome,
              floor: view.floor,
              enemy: { ...view.enemy, name: apiResult.battle.enemyName },
              finalState: apiResult.battle.finalState,
              grantedTitleId: apiResult.applied?.grantedTitleId,
            });
          }}
          onForfeit={async () => {
            await challenge.forfeit();
            setView({ kind: "run_ended", lastFloor: view.floor - 1 });
          }}
        />
      )}

      {view.kind === "result" && (
        <ResultView
          outcome={view.outcome}
          floor={view.floor}
          enemy={view.enemy}
          finalState={view.finalState}
          grantedTitleId={view.grantedTitleId}
          playerName={playerName}
          playerStatus={playerStatus}
          onNext={() => {
            if (view.outcome === "win") {
              const nextFloor = state.run?.currentFloor ?? view.floor + 1;
              setView(buildReady(nextFloor, state.run?.upcomingEnemy));
            } else {
              setView({ kind: "run_ended", lastFloor: view.floor - 1 });
            }
          }}
        />
      )}

      {view.kind === "run_ended" && (
        <RunEndedView
          state={state}
          lastFloor={view.lastFloor}
          onClose={() => setView({ kind: "entry" })}
        />
      )}

      {!runActive &&
        view.kind !== "entry" &&
        view.kind !== "run_ended" && (
          <button
            type="button"
            onClick={() => setView({ kind: "entry" })}
            className="mt-3 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
          >
            돌아가기
          </button>
        )}
    </div>
  );
}

// 도전 모드 적 — 항상 TOWER_CHALLENGE_MODIFIER (1.5× HP/ATK/DEF) 적용.
function buildReady(floor: number, upcoming?: { name: string }): View {
  const modifier = TOWER_CHALLENGE_MODIFIER;
  const slot = bossSlotForFloor(floor);
  if (slot) {
    const base = bossBaseMonster(slot);
    const scaled = scaledStats(base, floor, slot.bossMultiplier, modifier);
    const enemy: Monster = {
      ...base,
      name: bossDisplayName(slot),
      hp: scaled.hp,
      atk: scaled.atk,
      def: scaled.def,
      spd: scaled.spd,
    };
    return { kind: "ready", floor, enemy, isBoss: true };
  }
  const pool = mobPoolForFloor(floor);
  if (pool.length === 0) {
    const fb = BOSS_SLOTS[0];
    const base = bossBaseMonster(fb);
    const scaled = scaledStats(base, floor, 1, modifier);
    return {
      kind: "ready",
      floor,
      enemy: { ...base, name: `${floor}층의 도전자`, ...scaled },
      isBoss: false,
    };
  }
  const name =
    upcoming?.name && MONSTERS[upcoming.name]
      ? upcoming.name
      : pickMobFromPool(pool);
  const base =
    MONSTERS[name] ?? MONSTERS[pool[0]] ?? bossBaseMonster(BOSS_SLOTS[0]);
  const scaled = scaledStats(base, floor, 1, modifier);
  return { kind: "ready", floor, enemy: { ...base, ...scaled }, isBoss: false };
}

function EntryView({
  state,
  pending,
  error,
  onStart,
  onResume,
  onForfeit,
}: {
  state: TowerChallengeState;
  pending: string | null;
  error: string | null;
  onStart: () => Promise<void>;
  onResume: () => void;
  onForfeit: () => Promise<void>;
}) {
  const runActive = state.run !== null;
  const dailyIsToday = state.daily?.date === todayKey();
  const attemptsUsed = dailyIsToday ? (state.daily?.attempts ?? 0) : 0;
  const attemptsLeft = Math.max(0, TOWER_CHALLENGE_DAILY_ATTEMPTS - attemptsUsed);
  return (
    <div className="space-y-3">
      <Card padding="md">
        <div className="grid grid-cols-2 gap-3 text-xs">
          <Stat label="최고 도달" value={`${state.progress.highestFloor}층`} />
          <Stat
            label="오늘 시도"
            value={`${attemptsUsed} / ${TOWER_CHALLENGE_DAILY_ATTEMPTS}`}
          />
        </div>
        <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
          F50 보스 클리어 시 「{TITLES[TOWER_CHALLENGE_TITLE_ID]?.name}」 칭호.
        </p>
      </Card>

      {runActive ? (
        <Card padding="md">
          <p className="text-sm">
            진행 중인 도전 — 현재 <b>{state.run!.currentFloor}층</b>.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={onResume}
              disabled={pending !== null}
              className="flex-1 whitespace-nowrap rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              이어하기
            </button>
            <button
              type="button"
              onClick={onForfeit}
              disabled={pending !== null}
              className="flex-1 whitespace-nowrap rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-zinc-700"
            >
              {pending === "forfeit" ? "포기 중..." : "포기"}
            </button>
          </div>
        </Card>
      ) : (
        <Card padding="md">
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            새 도전. 항상 <b>1층</b>부터.
          </p>
          <button
            type="button"
            onClick={onStart}
            disabled={attemptsLeft <= 0 || pending !== null}
            className="mt-3 w-full rounded-md bg-rose-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending === "start"
              ? "시작 중..."
              : attemptsLeft <= 0
                ? "오늘 시도 소진"
                : `도전 시작 (남은 ${attemptsLeft}회)`}
          </button>
        </Card>
      )}

      {error && (
        <p className="text-xs text-rose-600 dark:text-rose-400">에러: {error}</p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
        {value}
      </div>
    </div>
  );
}

function ReadyView({
  floor,
  enemy,
  isBoss,
  disabled,
  onFight,
  onForfeit,
}: {
  floor: number;
  enemy: Monster;
  isBoss: boolean;
  disabled: boolean;
  onFight: () => Promise<void>;
  onForfeit: () => Promise<void>;
}) {
  return (
    <div className="space-y-3">
      <Card padding="md">
        <div className="text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          {floor}층 {isBoss ? "· 보스" : ""}
          {floor === TOWER_CHALLENGE_TITLE_FLOOR && " · 칭호 임계"}
        </div>
        <h3 className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {enemy.name}
        </h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          HP {enemy.hp} · ATK {enemy.atk} · DEF {enemy.def} · SPD {enemy.spd}
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onFight}
            disabled={disabled}
            className="flex-1 rounded-md bg-rose-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            전투 진입
          </button>
          <button
            type="button"
            onClick={onForfeit}
            disabled={disabled}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-zinc-700"
          >
            포기
          </button>
        </div>
      </Card>
    </div>
  );
}

function ResultView({
  outcome,
  floor,
  enemy,
  finalState,
  grantedTitleId,
  playerName,
  playerStatus,
  onNext,
}: {
  outcome: "win" | "lose";
  floor: number;
  enemy: Monster;
  finalState: BattleState;
  grantedTitleId?: string;
  playerName: string;
  playerStatus: BattlePlayerStatus;
  onNext: () => void;
}) {
  const grantedTitle = grantedTitleId ? TITLES[grantedTitleId] : undefined;
  return (
    <div className="space-y-3">
      <Card padding="md">
        <div
          className={`text-xs uppercase tracking-wider ${
            outcome === "win"
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-rose-600 dark:text-rose-400"
          }`}
        >
          {floor}층 — {outcome === "win" ? "클리어" : "패배"}
        </div>
        <h3 className="mt-1 flex items-center gap-1.5 text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {outcome === "win" ? (
            <Star size={16} weight="fill" className="text-amber-500" />
          ) : (
            <Skull size={16} weight="duotone" className="text-rose-500" />
          )}
          {enemy.name}
        </h3>
        {grantedTitle && (
          <div className="mt-2 rounded-md border border-rose-300 bg-rose-50 p-2 text-xs text-rose-800 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-200">
            <div className="flex items-center gap-1.5 font-semibold">
              <Crown size={12} weight="fill" />
              새 칭호 — {grantedTitle.name}
            </div>
            <p className="mt-0.5 text-[11px] leading-snug">
              {grantedTitle.description}
            </p>
          </div>
        )}
      </Card>

      <BattleScene
        state={finalState}
        playerName={playerName}
        playerStatus={playerStatus}
      />

      <button
        type="button"
        onClick={onNext}
        className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        {outcome === "win" ? "다음 층" : "결과 보기"}
      </button>
    </div>
  );
}

function RunEndedView({
  state,
  lastFloor,
  onClose,
}: {
  state: TowerChallengeState;
  lastFloor: number;
  onClose: () => void;
}) {
  return (
    <div className="space-y-3">
      <Card padding="md">
        <div className="text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          도전 종료
        </div>
        <h3 className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">
          도달 {lastFloor}층
        </h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          도전 최고 기록 {state.progress.highestFloor}층.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
        >
          <ArrowsClockwise size={14} />
          돌아가기
        </button>
      </Card>
    </div>
  );
}
