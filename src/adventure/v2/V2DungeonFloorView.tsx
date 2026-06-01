"use client";

import { useEffect, useState } from "react";
import { Gear } from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { HuntResultCard } from "@/adventure/v2/HuntResultCard";
import { applyHpRegen, canHuntWithHp } from "@/adventure/v2/hpRegen";
import { HpBar, type HpBarState } from "@/adventure/v2/HpBar";
import {
  BatchSummaryCard,
  type BatchSummary,
} from "@/adventure/v2/BatchSummaryCard";
import { ReplayBattleScene } from "@/adventure/v2/ReplayBattleScene";
import { useDungeonHunt } from "@/adventure/v2/useDungeonHunt";
import { HUNT_COST, type StaminaState } from "@/adventure/v2/stamina";
import { MAIN_DUNGEON } from "@/adventure/data/v2/dungeon";
import { TutorialOverlayInner } from "@/adventure/tutorial/TutorialOverlay";
import {
  TUTORIAL_ENABLED_FLAG,
  TUTORIAL_V2_FIRST_LEVELUP,
} from "@/adventure/tutorial/flags";
import { useStoryFlags } from "@/adventure/storyFlags/useStoryFlags";
import type {
  V2MaterialId,
} from "@/adventure/data/v2/dungeonDrops";
import type { V2EquipmentId } from "@/adventure/data/v2/v2Equipment";
import type { V2StatKey } from "@/adventure/data/v2/v2StatKeys";
import type { DungeonFloorId } from "@/adventure/data/v2/types";
import type { Gender } from "@/adventure/profile/avatars";

// 한 층 전용 던전 페이지. 1회 사냥 + 5/10회 일괄 사냥 (한 번에 N회, 합산 결과).
// 옛 무한 자동/연속 useEffect 트리거 폐기 — runBatch 가 직접 for-loop with await.

// 사냥 버튼이 한 번에 처리할 횟수. 전투 설정에서 고르면 메인 사냥 버튼이 이 값을 반영한다.
// 1 이면 단판(hunt), 5/10 이면 일괄(runBatch).
const HUNT_COUNTS = [1, 5, 10] as const;
type HuntCount = (typeof HUNT_COUNTS)[number];

export function V2DungeonFloorView({
  floorId,
  outpostId,
  outpostName,
  playerName,
  playerGender,
  stamina,
  setStamina,
  hp,
  setHp,
  onSeekHealing,
  onBack,
  playerSubtitle,
}: {
  floorId: DungeonFloorId;
  outpostId: string;
  outpostName: string;
  playerName: string;
  playerGender: Gender;
  // 전역 stamina + setter — V2GameFlow.
  stamina: StaminaState;
  setStamina: (s: StaminaState) => void;
  // 전역 HP + setter — V2GameFlow. 미로딩(null)이면 클라 게이트 비활성(서버가 최종 권위).
  // dev 하니스(DungeonHunt)에선 미전달 → optional.
  hp?: HpBarState | null;
  setHp?: (s: HpBarState) => void;
  // "치료소로 가기" — 마을 치료소 뷰로 이동. 미전달이면 버튼 숨김.
  onSeekHealing?: () => void;
  onBack: () => void;
  // 전투 장면 플레이어 이름 아래 부제(예: "Lv.42 · 견습 검사 · 무속성").
  playerSubtitle?: string;
}) {
  const floor = MAIN_DUNGEON.floors.find((f) => f.id === floorId);
  const { busy, lastResult, hunt } = useDungeonHunt({
    outpostId,
    setStamina,
  });
  // 일괄 사냥 상태.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [batchSummary, setBatchSummary] = useState<BatchSummary | null>(null);
  // 선택한 사냥 횟수 — 메인 버튼이 단판/일괄을 이 값으로 결정. 기본 1(단판).
  const [huntCount, setHuntCount] = useState<HuntCount>(1);

  // HP 게이트용 1초 틱 — 시간 재생으로 회복되면 사냥 버튼이 자동 재활성된다. (HpBar 와 같은 패턴)
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // 사냥 응답의 최종 HP 로 전역 HP 갱신 — anchor = 지금(응답 수신 시각 ≈ 서버 now).
  const recordHp = (r: { hpAfter: number; maxHp: number }) => {
    setHp?.({ hp: r.hpAfter, maxHp: r.maxHp, anchorMs: Date.now() });
  };

  const { state: storyFlags, set: setStoryFlag } = useStoryFlags();

  const showLevelupModal =
    !!lastResult &&
    lastResult.levelsGained > 0 &&
    storyFlags.flags.includes(TUTORIAL_ENABLED_FLAG) &&
    !storyFlags.flags.includes(TUTORIAL_V2_FIRST_LEVELUP);

  const runBatch = async (count: number) => {
    if (!floor) return;
    setSettingsOpen(false);
    setBatchSummary(null);
    setBatchRunning(true);
    setBatchProgress({ done: 0, total: count });

    let wins = 0;
    let losses = 0;
    let totalExp = 0;
    let totalProficiency = 0;
    let totalGold = 0;
    let levelsGained = 0;
    const drops: Partial<Record<V2MaterialId, number>> = {};
    const droppedEquipments: V2EquipmentId[] = [];
    const statGains: Partial<Record<V2StatKey, number>> = {};
    let stoppedReason: BatchSummary["stoppedReason"] = null;
    let completed = 0;

    for (let i = 0; i < count; i++) {
      const r = await hunt(floor.id);
      if (!r) {
        stoppedReason = "error";
        break;
      }
      recordHp(r);
      completed++;
      setBatchProgress({ done: completed, total: count });
      if (r.won) wins++;
      else losses++;
      totalExp += r.expGained;
      totalProficiency += r.proficiencyGained ?? 0;
      totalGold += r.goldGained;
      levelsGained += r.levelsGained;
      for (const [id, n] of Object.entries(r.drops ?? {})) {
        const key = id as V2MaterialId;
        drops[key] = (drops[key] ?? 0) + (n ?? 0);
      }
      for (const [k, n] of Object.entries(r.statGains ?? {})) {
        const key = k as V2StatKey;
        statGains[key] = (statGains[key] ?? 0) + (n ?? 0);
      }
      if (r.droppedEquipment) droppedEquipments.push(r.droppedEquipment);
      // 사망 또는 체력 부족(5% 미만)이면 다음 사냥이 어차피 서버에서 막히므로 중단.
      // 헛돈(409) 없이 즉시 멈추고, 패배(0)·생존했지만 저체력을 라벨로 구분.
      if (!canHuntWithHp(r.hpAfter, r.maxHp)) {
        stoppedReason = r.hpAfter <= 0 ? "death" : "recovery";
        break;
      }
      // 다음 사냥 전 스태미너 사전 검사 — 직전 응답의 잔량 기준.
      // (response 의 stamina 가 setStamina 됐지만 React state 라 await 즉시 안 보임.
      //  마지막 hunt 가 실패 시 다음 시도가 error 로 처리되니 안전.)
    }

    setBatchSummary({
      attempted: count,
      completed,
      wins,
      losses,
      totalExp,
      totalProficiency,
      totalGold,
      levelsGained,
      statGains,
      drops,
      droppedEquipments,
      stoppedReason,
    });
    setBatchProgress(null);
    setBatchRunning(false);
  };

  if (!floor) {
    return (
      <main className="mx-auto max-w-[720px] space-y-4 p-6">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          ← 전투로
        </button>
        <div className="text-sm text-rose-600 dark:text-rose-400">
          알 수 없는 구역입니다.
        </div>
      </main>
    );
  }

  const lowStamina = stamina.current < HUNT_COST;
  const oneActionDisabled = busy || batchRunning;
  // 라이브 HP(시간 재생 반영) 기준 회복 필요 여부 — 5% 미만이면 사냥 차단(서버와 동일 기준).
  // hp 미로딩(null)이면 게이트 비활성 — 서버 가드가 최종 차단.
  const liveHp = hp
    ? applyHpRegen(hp.hp, Math.max(1, hp.maxHp), hp.anchorMs, now).hp
    : null;
  const needsRecovery =
    hp != null && liveHp != null && !canHuntWithHp(liveHp, hp.maxHp);

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <header className="space-y-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          ← 전투로
        </button>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-lg font-bold">{floor.name}</h1>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {outpostName}
          </span>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {floor.requirement.kind === "power"
            ? `권장 파워 ${floor.requirement.min}`
            : `엔드 컨텐츠 ${floor.requirement.tier}`}
        </p>
      </header>

      <Card padding="md">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              setBatchSummary(null);
              if (huntCount === 1) {
                void hunt(floor.id).then((r) => {
                  if (r) recordHp(r);
                });
              } else {
                void runBatch(huntCount);
              }
            }}
            disabled={oneActionDisabled || lowStamina || needsRecovery}
            className="flex-1 rounded-md border border-emerald-600 bg-emerald-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {batchRunning && batchProgress
              ? `${batchProgress.done}/${batchProgress.total} 처리 중…`
              : busy
                ? "사냥 중…"
                : needsRecovery
                  ? "회복 필요"
                  : huntCount === 1
                    ? "사냥 (스태미너 1)"
                    : `${huntCount}회 사냥 (스태미너 ${huntCount})`}
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen((o) => !o)}
            disabled={batchRunning}
            aria-label="전투 설정"
            className="flex shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <Gear size={16} weight="duotone" />
          </button>
        </div>
        {settingsOpen && (
          <div className="mt-3 space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              사냥 횟수 — 고른 만큼 사냥 버튼이 한 번에 처리합니다.
            </p>
            <div className="flex gap-2">
              {HUNT_COUNTS.map((n) => {
                const selected = huntCount === n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setHuntCount(n)}
                    aria-pressed={selected}
                    disabled={batchRunning}
                    className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors disabled:opacity-50 ${
                      selected
                        ? "border-emerald-500 bg-emerald-100 font-medium text-emerald-900 dark:border-emerald-500 dark:bg-emerald-900 dark:text-emerald-100"
                        : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {n}회
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {needsRecovery && (
        <div className="rounded-md border border-rose-300 bg-rose-50 px-4 py-3 dark:border-rose-800 dark:bg-rose-950">
          <p className="text-sm font-medium text-rose-700 dark:text-rose-300">
            체력이 부족해 전투할 수 없습니다.
          </p>
          <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
            마을 치료소에서 회복하거나, 잠시 기다리면 체력이 서서히 회복됩니다.
          </p>
          {onSeekHealing && (
            <button
              type="button"
              onClick={onSeekHealing}
              className="mt-2.5 w-full rounded-md border border-rose-600 bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700"
            >
              치료소로 가기
            </button>
          )}
        </div>
      )}

      {/* batch summary 가 우선 노출. 1회 사냥 결과(HuntResultCard) 는 summary 없을 때만. */}
      {batchSummary ? (
        <>
          <BatchSummaryCard summary={batchSummary} />
          {/* 일괄(5/10회) 사냥 직후에만 잔여 체력 바 노출 — 연속 사냥으로 깎인 HP 확인용. */}
          {hp && <HpBar state={hp} />}
        </>
      ) : (
        lastResult && <HuntResultCard result={lastResult} />
      )}

      {showLevelupModal && (
        <TutorialOverlayInner
          title="레벨 업! 🎉"
          body={
            <>
              <p>새로운 레벨에 도달했습니다. 캐릭터가 더 강해졌어요.</p>
              <p>
                레벨이 오르면 능력치가 한계치까지 무작위로 성장합니다. 그 한계치를
                더 끌어올리려면 사냥으로 모은 숙달 포인트를 <strong>성장의 신전</strong>
                에서 수행에 쓰면 돼요.
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                계속 사냥해 다음 구역 입장 레벨까지 도달해보세요.
              </p>
            </>
          }
          dismissLabel="계속 사냥"
          onDismiss={() => setStoryFlag(TUTORIAL_V2_FIRST_LEVELUP)}
        />
      )}

      {/* 1회 사냥 replay — batch summary 표시 중에는 숨김(합산만 보길 원함). */}
      {!batchSummary && lastResult?.replay && (
        <ReplayBattleScene
          payload={lastResult.replay}
          startPlayerHp={lastResult.startPlayerHp}
          playerName={playerName}
          gender={playerGender}
          exp={lastResult.expForBar ?? 0}
          maxExp={lastResult.maxExpForBar ?? 1}
          hpCharges={lastResult.hpCharges}
          mpCharges={lastResult.mpCharges}
          playerSubtitle={playerSubtitle}
        />
      )}
    </main>
  );
}
