"use client";

import { useState, type ReactNode } from "react";
import { ArrowsClockwise, Coins, Skull, Star } from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { TabBar } from "@/components/ui/TabBar";
import { TowerChallengeView } from "./TowerChallengeView";
import type { BattleState } from "@/adventure/battle/engine";
import {
  BattleScene,
  type BattlePlayerStatus,
} from "@/adventure/battle/BattleScene";
import type { Monster } from "@/adventure/data/monsters";
import { MONSTERS } from "@/adventure/data/monsters";
import {
  availableStartFloors,
  isBossFloor,
  scaledStats,
  startFloorAfterCheckpoint,
} from "./scaling";
import { currentWeeklyModifier } from "./modifiers";
import {
  BOSS_SLOTS,
  bossBaseMonster,
  bossDisplayName,
  bossSlotForFloor,
  mobPoolForFloor,
  pickMobFromPool,
} from "./floorPools";
import { milestoneFor } from "./rewards";
import { RUNES } from "@/adventure/data/runes";
import { TOWER_DAILY_ATTEMPTS, type TowerState } from "./types";
import { todayKey } from "./dailyKey";
import { useTower, type TowerApiResponse } from "./useTower";

// 고탑 진입 페이지 — 한 컴포넌트 안에서 entry / ready / result / run_ended 화면을 전환.
// 전투는 서버 측 resolveBattle 이 수행. 클라는 의도(fight_floor) 만 보내고 응답으로 받은
// BattleState 를 BattleScene 에 그대로 넘긴다 (anti-cheat).
//
// 페이지 형태로 운영 — 이전엔 모달이었으나 모달 안에서 상태 갱신이 한 박자 늦어 화면이
// 어긋나는 사례가 있어 서브뷰 페이지로 전환 (router.push ?sub=tower).

type AutoSummary = NonNullable<TowerApiResponse["auto"]>;

type View =
  | { kind: "entry" } // 시작 또는 이어하기 선택
  | { kind: "ready"; floor: number; enemy: Monster; isBoss: boolean }
  | {
      kind: "result";
      outcome: "win" | "lose";
      floor: number;
      enemy: Monster;
      finalState: BattleState;
      /** 보스층 클리어 시 서버가 굴린 룬·토큰 드롭. 미보스/패배 시 undefined. */
      bossDrops?: NonNullable<TowerApiResponse["applied"]>["bossDrops"];
    }
  | {
      kind: "auto_result";
      summary: AutoSummary;
      lastEnemy: Monster;
      lastBattle: BattleState;
    }
  | { kind: "run_ended"; lastFloor: number };

export function TowerPage({
  onBack,
  playerName,
  playerStatus,
  onApplied,
  headerExtra,
}: {
  onBack: () => void;
  playerName: string;
  /** BattleScene 의 HUD (HP/EXP 바, 캐릭터 아바타) 에 필요한 상태. */
  playerStatus: BattlePlayerStatus;
  /** 마일스톤 보상으로 character/inventory 가 갱신되면 호출 — 부모에서 state 동기화. */
  onApplied?: (r: TowerApiResponse) => void;
  /** 헤더 바로 아래 노출 슬롯 — 전술 선택기 등. */
  headerExtra?: ReactNode;
}) {
  const tower = useTower({ onApplied });
  const [view, setView] = useState<View>({ kind: "entry" });
  const [mode, setMode] = useState<"normal" | "challenge">("normal");

  const state = tower.state;
  const runActive = state.run !== null;

  return (
    <div className="space-y-3">
      <SubViewHeader title="고탑" onBack={onBack} />
      {headerExtra}
      <Card as="section" padding="sm">
        <TabBar
          tabs={[
            { key: "normal", label: "일반 탑" },
            { key: "challenge", label: "도전 모드" },
          ]}
          active={mode}
          onChange={setMode}
          ariaLabel="고탑 모드"
        />
      </Card>

      {mode === "challenge" ? (
        <TowerChallengeView
          playerName={playerName}
          playerStatus={playerStatus}
        />
      ) : (
        <NormalTowerBody
          tower={tower}
          view={view}
          setView={setView}
          state={state}
          runActive={runActive}
          playerName={playerName}
          playerStatus={playerStatus}
        />
      )}
    </div>
  );
}

function NormalTowerBody({
  tower,
  view,
  setView,
  state,
  runActive,
  playerName,
  playerStatus,
}: {
  tower: ReturnType<typeof useTower>;
  view: View;
  setView: (v: View) => void;
  state: TowerState;
  runActive: boolean;
  playerName: string;
  playerStatus: BattlePlayerStatus;
}) {
  return (
    <>
      <Card padding="md">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          영원히 끝나지 않는 수직 미궁. 10층마다 보스가 길을 막는다.
        </p>
      </Card>

      {view.kind === "entry" && (
        <EntryView
          state={state}
          pending={tower.pending}
          error={tower.error}
          onStart={async (startFloor) => {
            const r = await tower.start(startFloor);
            if (r.ok && r.tower?.run) {
              setView(
                buildReady(r.tower.run.currentFloor, r.tower.run.upcomingEnemy),
              );
            }
          }}
          onResume={() => {
            if (state.run)
              setView(buildReady(state.run.currentFloor, state.run.upcomingEnemy));
          }}
          onForfeit={async () => {
            await tower.forfeit();
          }}
        />
      )}

      {view.kind === "ready" && (
        <ReadyView
          floor={view.floor}
          enemy={view.enemy}
          isBoss={view.isBoss}
          reviveAvailable={state.run?.reviveAvailable !== false}
          disabled={tower.pending !== null}
          onFight={async () => {
            const apiResult = await tower.fightFloor();
            if (!apiResult.ok || !apiResult.battle) return;
            const outcome =
              apiResult.applied?.outcome === "lose" ? "lose" : "win";
            setView({
              kind: "result",
              outcome,
              floor: view.floor,
              enemy: { ...view.enemy, name: apiResult.battle.enemyName },
              finalState: apiResult.battle.finalState,
              bossDrops: apiResult.applied?.bossDrops,
            });
          }}
          onAutoToBoss={async () => {
            const apiResult = await tower.fightFloorsAuto();
            if (!apiResult.ok || !apiResult.battle || !apiResult.auto) return;
            setView({
              kind: "auto_result",
              summary: apiResult.auto,
              lastEnemy: { ...view.enemy, name: apiResult.battle.enemyName },
              lastBattle: apiResult.battle.finalState,
            });
          }}
          onForfeit={async () => {
            await tower.forfeit();
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
          milestone={apparentMilestone(view.outcome, view.floor)}
          bossDrops={view.bossDrops}
          playerName={playerName}
          playerStatus={playerStatus}
          onNext={() => {
            if (view.outcome === "win") {
              // 다음 층 — 서버 응답에 따라 currentFloor 가 이미 +1, upcomingEnemy 도 새 층용.
              const nextFloor = state.run?.currentFloor ?? view.floor + 1;
              setView(buildReady(nextFloor, state.run?.upcomingEnemy));
            } else {
              setView({ kind: "run_ended", lastFloor: view.floor - 1 });
            }
          }}
        />
      )}

      {view.kind === "auto_result" && (
        <AutoResultView
          summary={view.summary}
          lastEnemy={view.lastEnemy}
          lastBattle={view.lastBattle}
          playerName={playerName}
          playerStatus={playerStatus}
          onNext={() => {
            if (view.summary.reason === "death") {
              setView({
                kind: "run_ended",
                lastFloor: view.summary.endFloor,
              });
              return;
            }
            // next_is_boss / revive_used → 같은 currentFloor 에서 수동 모드 진입.
            const nextFloor = state.run?.currentFloor ?? view.summary.endFloor;
            setView(buildReady(nextFloor, state.run?.upcomingEnemy));
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
        view.kind !== "run_ended" &&
        view.kind !== "auto_result" && (
          // 안전망 — 서버 측 run 이 비었는데 화면이 ready/result 면 entry 로 복귀.
          <button
            type="button"
            onClick={() => setView({ kind: "entry" })}
            className="mt-3 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
          >
            돌아가기
          </button>
        )}
    </>
  );
}

function apparentMilestone(outcome: "win" | "lose", floor: number) {
  if (outcome !== "win") return null;
  if (!isBossFloor(floor)) return null;
  return milestoneFor(floor);
}

// upcoming: 서버가 픽해 state.run.upcomingEnemy 에 저장해둔 잡몹 이름. 있으면 그걸 그대로
// 표시해 다음 fight_floor 결과와 이름·이미지·스탯이 일치한다. 없으면(옛 런/풀 비어 있음)
// 종전 동작 — 클라가 자체적으로 풀에서 한 번 픽 (서버 fight 와 mismatch 가능, 한 번 뒤 회복).
// 주간 모디파이어가 있으면 스탯 마지막에 곱해진다 (서버 buildFloorEnemy 와 일치).
function buildReady(floor: number, upcoming?: { name: string }): View {
  const modifier = currentWeeklyModifier();
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
    // 매핑 실패 안전망 — 빈 풀이면 첫 보스 슬롯의 베이스를 사용.
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
  // 서버 픽 우선 — 없거나 알 수 없는 이름이면 풀에서 즉시 픽 (폴백).
  const name =
    upcoming?.name && MONSTERS[upcoming.name]
      ? upcoming.name
      : pickMobFromPool(pool);
  const base =
    MONSTERS[name] ?? MONSTERS[pool[0]] ?? bossBaseMonster(BOSS_SLOTS[0]);
  const scaled = scaledStats(base, floor, 1, modifier);
  return {
    kind: "ready",
    floor,
    enemy: { ...base, ...scaled },
    isBoss: false,
  };
}

function EntryView({
  state,
  pending,
  error,
  onStart,
  onResume,
  onForfeit,
}: {
  state: TowerState;
  pending: string | null;
  error: string | null;
  onStart: (startFloor: number) => Promise<void>;
  onResume: () => void;
  onForfeit: () => Promise<void>;
}) {
  const runActive = state.run !== null;
  // state.daily 는 마지막 서버 응답 시점의 값 — date 가 오늘 KST 와 다르면 자정이
  // 지났다는 뜻이라 이미 0/3 으로 봐야 한다. (서버 측 lazy reset 은 다음 액션에
  // 일어나지만, 그 액션을 일으키려면 버튼이 활성화돼야 하므로 표시는 클라가 먼저
  // 0 으로 보여 진입을 허용해야 한다.)
  const dailyIsToday = state.daily?.date === todayKey();
  const attemptsUsed = dailyIsToday ? (state.daily?.attempts ?? 0) : 0;
  const attemptsLeft = Math.max(0, TOWER_DAILY_ATTEMPTS - attemptsUsed);
  const startOptions = availableStartFloors(state.progress.highestFloor);
  const defaultStart = startFloorAfterCheckpoint(state.progress.highestFloor);
  const [selectedStart, setSelectedStart] = useState<number>(defaultStart);
  // highestFloor 가 바뀌어 옵션이 늘어났으면 selected 가 더 이상 유효하지 않을 수 있음.
  // 단순화 위해 옵션 안에 있으면 그대로, 아니면 defaultStart 로.
  const effectiveStart = startOptions.includes(selectedStart)
    ? selectedStart
    : defaultStart;
  const modifier = currentWeeklyModifier();
  return (
    <div className="space-y-3">
      <Card padding="md">
        <div className="mb-2 flex items-center gap-1.5 text-[11px]">
          <span className="rounded-full bg-violet-500/15 px-2 py-0.5 font-medium text-violet-700 dark:text-violet-300">
            이번 주: {modifier.name}
          </span>
          <span className="text-zinc-500 dark:text-zinc-400">{modifier.description}</span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <Stat label="최고 도달" value={`${state.progress.highestFloor}층`} />
          <Stat label="오늘 시도" value={`${attemptsUsed} / ${TOWER_DAILY_ATTEMPTS}`} />
        </div>
        {state.progress.claimedMilestones.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            <span>받은 마일스톤:</span>
            {state.progress.claimedMilestones.sort((a, b) => a - b).map((f) => (
              <span
                key={f}
                className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-amber-700 dark:text-amber-400"
              >
                <Star size={10} weight="fill" />
                F{f}
              </span>
            ))}
          </div>
        )}
      </Card>

      {runActive ? (
        <Card padding="md">
          <p className="text-sm">
            진행 중인 시도 — 현재 <b>{state.run!.currentFloor}층</b>.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={onResume}
              disabled={pending !== null}
              className="flex-1 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              이어하기
            </button>
            <button
              type="button"
              onClick={onForfeit}
              disabled={pending !== null}
              className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-zinc-700"
            >
              {pending === "forfeit" ? "포기 중..." : "포기"}
            </button>
          </div>
        </Card>
      ) : (
        <Card padding="md">
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            새 시도. 시작 층: <b>{effectiveStart}</b>층.
          </p>
          {startOptions.length > 1 && (
            <div className="mt-2 space-y-1">
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                낮은 보스 다시 잡아 인장 모으려면 아래에서 골라 시작.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {startOptions.map((f) => {
                  const active = f === effectiveStart;
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setSelectedStart(f)}
                      className={
                        "rounded-md border px-2 py-1 text-xs font-medium transition-colors " +
                        (active
                          ? "border-amber-500 bg-amber-100 text-amber-900 dark:border-amber-500 dark:bg-amber-950/60 dark:text-amber-200"
                          : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900")
                      }
                    >
                      F{f}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => onStart(effectiveStart)}
            disabled={attemptsLeft <= 0 || pending !== null}
            className="mt-3 w-full rounded-md bg-amber-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
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
  reviveAvailable,
  disabled,
  onFight,
  onAutoToBoss,
  onForfeit,
}: {
  floor: number;
  enemy: Monster;
  isBoss: boolean;
  /** 자동 진행 부활 토큰 남음 여부 — 자동 버튼 보조 라벨용. */
  reviveAvailable: boolean;
  disabled: boolean;
  onFight: () => Promise<void>;
  onAutoToBoss: () => Promise<void>;
  onForfeit: () => Promise<void>;
}) {
  return (
    <div className="space-y-3">
      <Card padding="md">
        <div className="text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          {floor}층 {isBoss ? "· 보스" : ""}
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
        {!isBoss && (
          <button
            type="button"
            onClick={onAutoToBoss}
            disabled={disabled}
            className="mt-2 w-full rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 disabled:opacity-50 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
          >
            다음 보스까지 자동 진행
            <span className="ml-1 text-xs opacity-70">
              ({reviveAvailable ? "부활 1회 가능" : "부활 소진"})
            </span>
          </button>
        )}
      </Card>
    </div>
  );
}

function ResultView({
  outcome,
  floor,
  enemy,
  finalState,
  milestone,
  bossDrops,
  playerName,
  playerStatus,
  onNext,
}: {
  outcome: "win" | "lose";
  floor: number;
  enemy: Monster;
  finalState: BattleState;
  milestone: ReturnType<typeof milestoneFor>;
  bossDrops?: NonNullable<TowerApiResponse["applied"]>["bossDrops"];
  playerName: string;
  playerStatus: BattlePlayerStatus;
  onNext: () => void;
}) {
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
        {milestone && (
          <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            <div className="font-semibold">첫 도달 보상!</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              {milestone.gold ? (
                <span className="inline-flex items-center gap-0.5">
                  <Coins size={11} weight="fill" />
                  {milestone.gold.toLocaleString()}
                </span>
              ) : null}
              {milestone.materials?.map((m) => (
                <span key={m.id}>
                  {m.id} ×{m.count}
                </span>
              ))}
            </div>
          </div>
        )}
        {bossDrops && (
          <div className="mt-2 rounded-md border border-violet-300 bg-violet-50 p-2 text-xs text-violet-800 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
            <div className="font-semibold">보스 처치 보상</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              {bossDrops.reward.tokens > 0 && (
                <span>고탑의 인장 ×{bossDrops.reward.tokens}</span>
              )}
              {bossDrops.reward.runes.map((r) => (
                <span key={`${r.id}_${r.grade}`}>
                  {RUNES[r.id].name} {r.grade}T ×{r.count}
                </span>
              ))}
              {bossDrops.reward.runes.length === 0 &&
                bossDrops.reward.tokens === 0 && <span>없음</span>}
            </div>
          </div>
        )}
      </Card>

      {/* 전투 로그 + 최종 HP/EXP 가 한 화면에 — 일반 BattleView 와 같은 BattleScene. */}
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

function AutoResultView({
  summary,
  lastEnemy,
  lastBattle,
  playerName,
  playerStatus,
  onNext,
}: {
  summary: AutoSummary;
  lastEnemy: Monster;
  lastBattle: BattleState;
  playerName: string;
  playerStatus: BattlePlayerStatus;
  onNext: () => void;
}) {
  const reasonText: Record<AutoSummary["reason"], string> = {
    next_is_boss: "다음 층이 보스 — 자동 멈춤",
    revive_used: "사망 — 부활 1회 사용, 자동 중단",
    death: "사망 — 시도 종료",
  };
  const totalGold = summary.milestones.reduce(
    (s, m) => s + (m.reward.gold ?? 0),
    0,
  );
  const totalMaterials = summary.milestones.flatMap((m) => m.reward.materials ?? []);
  return (
    <div className="space-y-3">
      <Card padding="md">
        <div
          className={`text-xs uppercase tracking-wider ${
            summary.reason === "death"
              ? "text-rose-600 dark:text-rose-400"
              : summary.reason === "revive_used"
                ? "text-amber-600 dark:text-amber-400"
                : "text-emerald-600 dark:text-emerald-400"
          }`}
        >
          자동 진행
        </div>
        <h3 className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {summary.floorsCleared}층 클리어 ({summary.startFloor}~
          {summary.startFloor + summary.floorsCleared - 1})
        </h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {reasonText[summary.reason]}
        </p>
        {summary.milestones.length > 0 && (
          <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            <div className="font-semibold">자동 도중 첫 도달 보상</div>
            <div className="mt-1 space-y-0.5">
              {summary.milestones.map((m) => (
                <div key={m.floor}>
                  <span className="font-medium">F{m.floor}</span>
                  {m.reward.gold ? (
                    <span className="ml-2 inline-flex items-center gap-0.5">
                      <Coins size={11} weight="fill" />
                      {m.reward.gold.toLocaleString()}
                    </span>
                  ) : null}
                  {m.reward.materials?.map((mat) => (
                    <span key={mat.id} className="ml-2">
                      {mat.id} ×{mat.count}
                    </span>
                  ))}
                </div>
              ))}
            </div>
            {(totalGold > 0 || totalMaterials.length > 0) &&
              summary.milestones.length > 1 && (
                <div className="mt-1 border-t border-amber-300/60 pt-1 text-[11px]">
                  합계{" "}
                  {totalGold > 0 && (
                    <span className="inline-flex items-center gap-0.5">
                      <Coins size={10} weight="fill" />
                      {totalGold.toLocaleString()}
                    </span>
                  )}
                </div>
              )}
          </div>
        )}
      </Card>

      <Card padding="md">
        <div className="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          마지막 전투 — {lastEnemy.name}
        </div>
      </Card>
      <BattleScene
        state={lastBattle}
        playerName={playerName}
        playerStatus={playerStatus}
      />

      <button
        type="button"
        onClick={onNext}
        className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        {summary.reason === "death" ? "결과 보기" : "계속하기"}
      </button>
    </div>
  );
}

function RunEndedView({
  state,
  lastFloor,
  onClose,
}: {
  state: TowerState;
  lastFloor: number;
  onClose: () => void;
}) {
  return (
    <div className="space-y-3">
      <Card padding="md">
        <div className="text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          시도 종료
        </div>
        <h3 className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">
          도달 {lastFloor}층
        </h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          최고 기록 {state.progress.highestFloor}층.
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
