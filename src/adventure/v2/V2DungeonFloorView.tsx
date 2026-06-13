"use client";

import { useEffect, useRef, useState } from "react";
import { BackButton } from "@/components/ui/BackButton";
import { HeaderPanel } from "@/components/ui/HeaderPanel";
import { WeatherBadge } from "@/adventure/v2/WeatherBadge";
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
import { PlayerStatusCard } from "@/adventure/v2/PlayerStatusCard";
import { useDungeonHunt } from "@/adventure/v2/useDungeonHunt";
import { HUNT_COST, type StaminaState } from "@/adventure/v2/stamina";
import { MAIN_DUNGEON, depthName } from "@/adventure/data/v2/dungeon";
import { floorPowerGate } from "@/adventure/data/v2/dungeonLadder";
import { TutorialOverlayInner } from "@/adventure/tutorial/TutorialOverlay";
import {
  TUTORIAL_ENABLED_FLAG,
  TUTORIAL_V2_FIRST_LEVELUP,
} from "@/adventure/tutorial/flags";
import { useStoryFlags } from "@/adventure/storyFlags/useStoryFlags";
import type { Gender } from "@/adventure/profile/avatars";

// 한 층 전용 던전 페이지. 1회 사냥 + 5/10/50회 일괄 사냥 (한 번에 N회, 합산 결과).
// 옛 무한 자동/연속 useEffect 트리거 폐기 — runBatch 가 직접 for-loop with await.

// 사냥 버튼이 한 번에 처리할 횟수. 전투 설정에서 고르면 메인 사냥 버튼이 이 값을 반영한다.
// 1 이면 단판(hunt), 5/10/50 이면 일괄(runBatch).
const HUNT_COUNTS = [1, 5, 10, 50] as const;
type HuntCount = (typeof HUNT_COUNTS)[number];

// 사냥 횟수 기본값을 localStorage 에 영속 — 사냥터 재진입마다 1 로 리셋되는 번거로움 제거.
// 유효 옵션(HUNT_COUNTS) 외 저장값(옵션 변경·손상)은 1 로 폴백.
const HUNT_COUNT_STORAGE_KEY = "v2-hunt-count.v1";
function loadHuntCount(): HuntCount {
  if (typeof window === "undefined") return 1;
  try {
    const n = Number(localStorage.getItem(HUNT_COUNT_STORAGE_KEY));
    return (HUNT_COUNTS as readonly number[]).includes(n)
      ? (n as HuntCount)
      : 1;
  } catch {
    return 1;
  }
}
function saveHuntCount(n: HuntCount): void {
  try {
    localStorage.setItem(HUNT_COUNT_STORAGE_KEY, String(n));
  } catch {}
}

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
  frontierDepth = 2,
  onFrontierUnlocked,
  onLevelUp,
  rareMapIid = null,
  myElement,
}: {
  // 깊이 숫자 (테마당 6깊이: 1~6 들판·7~12 깊은 산·13+ 프론티어 밴드). 무한 — DungeonFloorId(1~8) 초과 가능.
  floorId: number;
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
  // 무한 프론티어 — 현재 최고 도달 깊이. floorId 가 이를 초과하면 도전(미정복) 구역.
  frontierDepth?: number;
  // 도전 성공 시 최고 깊이 갱신 콜백.
  onFrontierUnlocked?: (newMaxDepth: number) => void;
  // 레벨업 발생 시 호출 — 전역 캐릭터 상태(레벨/스탯/부제) 재조회용. 미전달이면 no-op.
  // (HP 는 recordHp 가 매 사냥 갱신하지만 레벨/스탯/부제는 viewerLevel 출처라 따로 새로고침 필요.)
  onLevelUp?: () => void;
  // 레어맵 입장 모드 — 보유 지도 iid (?rareMap=). 서버가 소유/깊이/판수를 검증·차감.
  rareMapIid?: string | null;
  // 내 캐릭터 속성 — 날씨 배지 단계 강조용.
  myElement?: string;
}) {
  // 이름은 항상 depthName(테마명 + 테마 내 로컬 번호, 예 "들판 2"). 깊이 1·2 의 authored 층
  // 객체(floor)는 권장 파워·존재 가드 용도로만 조회한다.
  const floor = MAIN_DUNGEON.floors.find((f) => f.id === floorId);
  const depth = Number(floorId);
  const displayName = depthName(depth);
  const powerGate = floor
    ? floor.requirement.kind === "power"
      ? floor.requirement.min
      : floorPowerGate(depth)
    : floorPowerGate(depth);
  // 도전(미정복) 여부 — 최고 도달 깊이+1 이 현재 깊이.
  const isChallenge = depth > frontierDepth;
  const { busy, lastResult, hunt, huntBatch } = useDungeonHunt({
    outpostId,
    setStamina,
    rareMapIid,
  });
  // 레어맵 남은 판수 — 단판/일괄 응답에서 갱신(서버 권위). null = 아직 응답 없음.
  const [rareMapRunsLeft, setRareMapRunsLeft] = useState<number | null>(null);
  // 일괄 사냥 상태.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchSummary, setBatchSummary] = useState<BatchSummary | null>(null);
  // 일괄 사냥 후 캐릭터 정보 카드용 — 서버 일괄 처리는 단판 lastResult 를 세우지 않으므로
  // 합산 응답의 마지막 상태(EXP 진행도·회복약 충전량)를 따로 담는다.
  const [batchStatus, setBatchStatus] = useState<{
    exp: number;
    maxExp: number;
    hpCharges?: number;
    mpCharges?: number;
    hasMp: boolean;
  } | null>(null);
  // 선택한 사냥 횟수 — 메인 버튼이 단판/일괄을 이 값으로 결정. 기본 1(단판).
  const [huntCount, setHuntCount] = useState<HuntCount>(1);
  // 저장된 기본값 로드(마운트 1회). SSR/hydration mismatch 피하려 default 1 후 effect 에서 적용
  // (useAutoPotionConfig 와 동일 패턴 — 클라 전용 localStorage 하이드레이션).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHuntCount(loadHuntCount());
  }, []);

  // HP 게이트용 1초 틱 — 시간 재생으로 회복되면 사냥 버튼이 자동 재활성된다. (HpBar 와 같은 패턴)
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // 스페이스바로 메인 사냥 버튼 발동. 훅이 early-return 앞이라야 해서 ref 로 최신 핸들러를 참조한다
  //   (아래 triggerHunt 가 매 렌더 ref.current 갱신). 입력창·포커스된 버튼·키 반복(꾹 누름)에선
  //   무시 — 타이핑/중복 발동/스크롤 방지. 비활성(busy·스태미너·회복) 가드는 triggerHunt 안에서.
  const triggerHuntRef = useRef<() => void>(() => {});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        tag === "BUTTON" ||
        t?.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      triggerHuntRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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

  // 일괄 사냥 — 서버가 count 회를 한 트랜잭션으로 처리(한 왕복, 딸깍). 합산 결과만 받아 표시 +
  //   최종 HP/깊이/레벨을 한 번만 반영(옛 클라 50회 루프·드르륵 카운터 폐기).
  const runBatch = async (count: number) => {
    setSettingsOpen(false);
    setBatchSummary(null);
    setBatchStatus(null);
    setBatchRunning(true);
    try {
      const b = await huntBatch(depth, count);
      if (!b) return; // 네트워크/서버 오류 — hook 이 로그 남김. 요약 없이 종료.
      setBatchSummary({
        attempted: b.attempted,
        completed: b.completed,
        wins: b.wins,
        losses: b.losses,
        totalExp: b.totalExp,
        totalProficiency: b.totalProficiency,
        totalGold: b.totalGold,
        levelsGained: b.levelsGained,
        statGains: b.statGains,
        hpGained: b.hpGained,
        mpGained: b.mpGained,
        drops: b.drops,
        droppedEquipments: b.droppedEquipments,
        droppedUniques: b.droppedUniques,
        rareMapDrops: b.rareMapDrops,
        stoppedReason: b.stoppedReason,
      });
      if (b.rareMapRunsLeft != null) setRareMapRunsLeft(b.rareMapRunsLeft);
      // 캐릭터 정보 카드 — 합산 후 현재 EXP 진행도·회복약 충전량(마지막 사냥 상태).
      setBatchStatus({
        exp: b.expAfter ?? 0,
        maxExp: b.maxExpAfter ?? 1,
        hpCharges: b.hpCharges ?? undefined,
        mpCharges: b.mpCharges ?? undefined,
        hasMp: (b.playerMaxMp ?? 0) > 0,
      });
      // 부수효과 — 서버가 합산해 준 마지막 상태로 한 번만.
      if (b.finalHpAfter != null && b.finalMaxHp != null) {
        recordHp({ hpAfter: b.finalHpAfter, maxHp: b.finalMaxHp });
      }
      if (
        isChallenge &&
        b.finalMaxDepth != null &&
        b.finalMaxDepth > frontierDepth
      ) {
        onFrontierUnlocked?.(b.finalMaxDepth);
      }
      if (b.levelsGained > 0) onLevelUp?.();
    } finally {
      setBatchRunning(false);
    }
  };

  // 깊이 1·2 는 authored 층 필수. 3+ 는 floor 없어도 OK (프론티어 — 데이터 도출).
  if (!floor && depth < 3) {
    return (
      <main className="mx-auto max-w-[720px] space-y-4 p-6">
        <BackButton onClick={onBack} />
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

  // 메인 사냥 버튼 발동(클릭·스페이스바 공용). 비활성 조건에선 무발동.
  //   레벨업 모달이 열렸으면 무발동 — 스페이스바 전역 리스너가 모달 오버레이를 우회해 뒤에서
  //   사냥이 돌지 않게(클릭은 오버레이가 막지만 키는 막지 못함).
  const triggerHunt = () => {
    if (oneActionDisabled || lowStamina || needsRecovery || showLevelupModal)
      return;
    setBatchSummary(null);
    if (huntCount === 1) {
      void hunt(depth).then((r) => {
        if (r) {
          recordHp(r);
          if (r.rareMapRunsLeft != null) setRareMapRunsLeft(r.rareMapRunsLeft);
          if (r.levelsGained > 0) onLevelUp?.();
          if (
            isChallenge &&
            r.won &&
            r.maxDepth != null &&
            r.maxDepth > frontierDepth
          ) {
            onFrontierUnlocked?.(r.maxDepth);
          }
        }
      });
    } else {
      void runBatch(huntCount);
    }
  };
  triggerHuntRef.current = triggerHunt;

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <HeaderPanel className="space-y-2">
        <BackButton onClick={onBack} />
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-lg font-bold">
            {displayName}
            {isChallenge && (
              <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-sm font-normal text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                도전
              </span>
            )}
          </h1>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {outpostName}
          </span>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          권장 전투력 {powerGate}
        </p>
        <WeatherBadge outpostId={outpostId} myElement={myElement} />
        {rareMapIid && (
          <div className="rounded-md border border-sky-300 bg-sky-50 px-2 py-1.5 text-xs font-medium text-sky-800 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-200">
            🗺 레어맵 사냥 중
            {rareMapRunsLeft != null && ` — 남은 ${rareMapRunsLeft}판`}
            {rareMapRunsLeft === 0 && " (소진 — 목록으로 돌아가세요)"}
          </div>
        )}
      </HeaderPanel>

      <Card padding="md">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={triggerHunt}
            disabled={oneActionDisabled || lowStamina || needsRecovery}
            className="flex-1 rounded-md border border-emerald-600 bg-emerald-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {batchRunning || busy
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
                    onClick={() => {
                      setHuntCount(n);
                      saveHuntCount(n);
                    }}
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
          {/* 일괄 사냥 후에도 캐릭터 정보(EXP 진행도·직업·회복약)를 확인 — 서버 일괄 처리는
              단판 lastResult 를 세우지 않으므로 합산 응답의 마지막 상태(batchStatus)로 표기. */}
          {batchStatus && (
            <PlayerStatusCard
              gender={playerGender}
              name={playerName}
              subtitle={playerSubtitle}
              exp={batchStatus.exp}
              maxExp={batchStatus.maxExp}
              hpCharges={batchStatus.hpCharges}
              mpCharges={batchStatus.mpCharges}
              hasMp={batchStatus.hasMp}
            />
          )}
          {/* 일괄(5/10/50회) 사냥 직후에만 잔여 체력 바 노출 — 연속 사냥으로 깎인 HP 확인용. */}
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
                레벨이 오르면 능력치가 한계치까지 무작위로 성장합니다. 그
                한계치를 더 끌어올리려면 사냥으로 모은 숙달 포인트를{" "}
                <strong>성장의 신전</strong>
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
          elementMatchup={lastResult.elementMatchup}
        />
      )}
    </main>
  );
}
