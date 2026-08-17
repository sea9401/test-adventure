"use client";

import { useEffect, useRef, useState } from "react";
import { BackButton } from "@/components/ui/BackButton";
import { Button } from "@/components/ui/Button";
import { DraftNumberInput } from "@/components/ui/DraftNumberInput";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { Gear } from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { HuntResultCard } from "@/adventure/v2/HuntResultCard";
import { applyHpRegen, canHuntWithHp } from "@/adventure/v2/hpRegen";
import { type HpBarState } from "@/adventure/v2/HpBar";
import {
  BatchSummaryCard,
  type BatchReplayEntry,
  type BatchSummary,
} from "@/adventure/v2/BatchSummaryCard";
import { ReplayBattleScene } from "@/adventure/v2/ReplayBattleScene";
import {
  PlayerStatusCard,
  playerCombatToBattleStats,
  type PlayerCombatStats,
} from "@/adventure/v2/PlayerStatusCard";
import { useDungeonHunt } from "@/adventure/v2/useDungeonHunt";
import {
  HUNT_COST,
  msUntilStaminaAtLeast,
  type StaminaState,
} from "@/adventure/v2/stamina";
import { HUNT_COOLDOWN_MS } from "@/adventure/data/v2/coreLoopConfig";
import {
  offlineSettleStopReasonLabel,
  settleOfflineHuntBatches,
} from "@/adventure/v2/offlineSettleApi";
import { MAIN_DUNGEON, huntStageName } from "@/adventure/data/v2/dungeon";
import { floorPowerGate } from "@/adventure/data/v2/dungeonLadder";
import {
  dungeonGrowthLabel,
  dungeonReadiness,
} from "@/adventure/v2/dungeonReadiness";
import { TutorialOverlayInner } from "@/adventure/tutorial/TutorialOverlay";
import {
  TUTORIAL_ENABLED_FLAG,
  TUTORIAL_V2_FIRST_LEVELUP,
} from "@/adventure/tutorial/flags";
import { useStoryFlags } from "@/adventure/storyFlags/useStoryFlags";
import type { Gender } from "@/adventure/profile/avatars";
import { RARE_MAP_KINDS } from "@/adventure/data/v2/rareMaps";
import type { RareMapInstance } from "@/adventure/data/v2/rareMaps";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import { DiscoveryNotice } from "@/adventure/v2/DiscoveryNotice";
import { RareMapCountdownText } from "@/adventure/v2/RareMapCountdownText";
import {
  AUTO_HUNT_LEVEL_TARGET,
  getAutoHuntStopReason,
  useAutoHuntStopConfig,
} from "@/adventure/v2/autoHuntStopConditions";
import {
  ADVENTURE_SUPPORT_PASS,
  huntCountsForAdventureSupport,
  normalizeHuntCount,
  type HuntCount,
} from "@/adventure/data/v2/adventureSupport";
import {
  experienceProgressUpdate,
  recoveryChargesUpdate,
  type ExperienceProgressUpdate,
  type RecoveryChargesUpdate,
} from "@/adventure/v2/recoveryChargesSync";
import {
  huntEndReasonText,
  type HuntEndReason,
} from "@/adventure/v2/huntEndNotice";

// 한 층 전용 던전 페이지. 1회 사냥 + 5/10/50회 일괄 사냥 (한 번에 N회, 합산 결과).
// 옛 무한 자동/연속 useEffect 트리거 폐기 — runBatch 가 직접 for-loop with await.

// 사냥 버튼이 한 번에 처리할 횟수. 전투 설정에서 고르면 메인 사냥 버튼이 이 값을 반영한다.
// 1 이면 단판(hunt), 5/10/50 이면 일괄(runBatch).
// 사냥 횟수 기본값을 localStorage 에 영속 — 사냥터 재진입마다 1 로 리셋되는 번거로움 제거.
// 지원권 권한에 없는 저장값(미가입자의 옛 50회 포함)·손상값은 1 로 폴백.
const HUNT_COUNT_STORAGE_KEY = "v2-hunt-count.v1";
function loadHuntCount(adventureSupportActive: boolean): HuntCount {
  if (typeof window === "undefined") return 1;
  try {
    return normalizeHuntCount(
      localStorage.getItem(HUNT_COUNT_STORAGE_KEY),
      adventureSupportActive,
    );
  } catch {
    return 1;
  }
}
function saveHuntCount(n: HuntCount): void {
  try {
    localStorage.setItem(HUNT_COUNT_STORAGE_KEY, String(n));
  } catch {}
}

type RecoveryChargesSnapshot = {
  baseHpCharges: number;
  baseMpCharges: number;
  hpCharges: number;
  mpCharges: number;
};

type ExpProgressSnapshot = {
  baseExp: number;
  baseMaxExp: number;
  exp: number;
  maxExp: number;
};

export function RareMapProgressNotice({
  map,
  serverNow,
  onReturnToNormalHunt,
  onExpire,
}: {
  map: RareMapInstance;
  serverNow: number;
  onReturnToNormalHunt?: () => void;
  onExpire?: () => void;
}) {
  return (
    <DiscoveryNotice
      kind="hunt"
      align="start"
      action={
        onReturnToNormalHunt ? (
          <Button
            size="xs"
            variant="info"
            onClick={onReturnToNormalHunt}
            className="shrink-0"
          >
            일반 사냥터로
          </Button>
        ) : undefined
      }
    >
      희귀 탐사 진행 중 — 남은 {map.runsLeft}판 · 30분 동안 개방 ·{" "}
      <RareMapCountdownText
        foundAt={map.foundAt}
        serverNow={serverNow}
        onExpire={onExpire}
      />
      {map.runsLeft === 0 && " (소진 — 목록으로 돌아가세요)"}
    </DiscoveryNotice>
  );
}

function nextRecoveryChargesSnapshot({
  prev,
  initialHpCharges,
  initialMpCharges,
  hpCharges,
  mpCharges,
}: {
  prev: RecoveryChargesSnapshot;
  initialHpCharges: number;
  initialMpCharges: number;
  hpCharges?: number | null;
  mpCharges?: number | null;
}): RecoveryChargesSnapshot {
  const prevStillCurrent =
    prev.baseHpCharges === initialHpCharges &&
    prev.baseMpCharges === initialMpCharges;
  return {
    baseHpCharges: initialHpCharges,
    baseMpCharges: initialMpCharges,
    hpCharges:
      hpCharges ?? (prevStillCurrent ? prev.hpCharges : initialHpCharges),
    mpCharges:
      mpCharges ?? (prevStillCurrent ? prev.mpCharges : initialMpCharges),
  };
}

// 오프라인 사냥 남은 시간 표기(ms → "1시간 23분"/"23분"/"45초").
function fmtOfflineRemain(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return `${m}분`;
  return `${s}초`;
}

export function V2DungeonFloorView({
  floorId,
  outpostId,
  outpostName,
  playerName,
  playerGender,
  currentLevel = 1,
  currentLevelCap = null,
  currentJobTier = null,
  initialExp = 0,
  initialMaxExp = 1,
  adventureSupportActive = false,
  initialHpCharges = 0,
  initialMpCharges = 0,
  stamina,
  staminaMax,
  setStamina,
  hp,
  setHp,
  mp,
  setMp,
  playerCombat,
  playerPrimaryAttack = "physical",
  onSeekHealing,
  onBack,
  playerSubtitle,
  playerProficiency = null,
  frontierDepth = 2,
  onFrontierUnlocked,
  onLevelUp,
  rareMapIid = null,
  combatCooldown,
  setCombatCooldown,
  setAtRiskGold,
  onGoldChange,
  onProficiencyChange,
  onExperienceChange,
  onRecoveryChargesChange,
  onEnterRareMap,
  onReturnToNormalHunt,
  offlineHunt,
  onRefresh,
}: {
  // 깊이 숫자 (테마당 6깊이: 1~6 들판·7+ 프론티어 밴드, 마른 협곡부터). 무한 — DungeonFloorId(1~8) 초과 가능.
  floorId: number;
  outpostId: string;
  outpostName: string;
  playerName: string;
  playerGender: Gender;
  currentLevel?: number;
  currentLevelCap?: number | null;
  currentJobTier?: number | null;
  // 첫 사냥 전 카드 높이 고정용 현재 상태. 이후에는 사냥 응답의 최신값이 우선한다.
  initialExp?: number;
  initialMaxExp?: number;
  // 월간 모험 지원권 활성 여부. 서버 만료 시각이 유효한 이용자만 50회 일괄 전투 허용.
  adventureSupportActive?: boolean;
  initialHpCharges?: number;
  initialMpCharges?: number;
  // 전역 stamina + setter — V2GameFlow.
  stamina: StaminaState;
  staminaMax?: number;
  setStamina: (s: StaminaState) => void;
  // 전역 HP + setter — V2GameFlow. 미로딩(null)이면 클라 게이트 비활성(서버가 최종 권위).
  // dev 하니스(DungeonHunt)에선 미전달 → optional.
  hp?: HpBarState | null;
  setHp?: (s: HpBarState) => void;
  // 전역 MP + setter — 사냥 후 갱신. 미전달이면 MP 바 비표시(dev 하니스).
  mp?: { mp: number; maxMp: number } | null;
  setMp?: (s: { mp: number; maxMp: number }) => void;
  // 유효 전투 스탯(공/방/속+상세) — 캐릭터 카드 표기용. me/state 권위.
  playerCombat?: PlayerCombatStats | null;
  playerPrimaryAttack?: "physical" | "magic";
  // "치료소로 가기" — 마을 치료소 뷰로 이동. 미전달이면 버튼 숨김.
  onSeekHealing?: () => void;
  onBack: () => void;
  // 전투 장면 플레이어 이름 아래 부제(예: "Lv.42 · 견습 검사 · 무속성").
  playerSubtitle?: string;
  // 현재 전직 중인 구체 직업의 숙련도("직업 숙련도") — 캐릭터 카드 상시 readout 의 시작값(화면 진입 시점).
  //   사냥 응답(masteryAfter/일괄 proficiencyAfter)이 들어오면 그 최신값이 우선. null=모험가(무직업).
  playerProficiency?: number | null;
  // 무한 프론티어 — 현재 최고 도달 깊이. floorId 가 이를 초과하면 도전(미정복) 구역.
  frontierDepth?: number;
  // 도전 성공 시 최고 깊이 갱신 콜백.
  onFrontierUnlocked?: (newMaxDepth: number) => void;
  // 레벨업 발생 시 호출 — 전역 캐릭터 상태(레벨/스탯/부제) 재조회용. 미전달이면 no-op.
  // (HP 는 recordHp 가 매 사냥 갱신하지만 레벨/스탯/부제는 viewerLevel 출처라 따로 새로고침 필요.)
  onLevelUp?: () => void;
  // 레어맵 입장 모드 — 보유 지도 iid (?rareMap=). 서버가 소유/깊이/판수를 검증·차감.
  rareMapIid?: string | null;
  // === 코어루프(V2_CORE_LOOP_V2) flag-on 전용 — 미전달(dev 하니스)/null(flag off) 이면 비활성 ===
  // 전투 쿨다운(클라 로컬 nextBattleAt). 비null = flag on → 스태미나 라벨 대신 쿨다운 카운트다운.
  combatCooldown?: { nextBattleAt: number; cooldownMs: number } | null;
  setCombatCooldown?: (c: { nextBattleAt: number; cooldownMs: number } | null) => void;
  // 위험 골드 갱신 — 사냥 응답의 atRiskGold 를 전역(V2TopBar 뱃지)으로 반영.
  setAtRiskGold?: (n: number | null) => void;
  // 사냥으로 변한 공용 자원 readout 동기화 — 같은 layout 내 은행/상단 상태가 stale 해지지 않게 한다.
  onGoldChange?: (n: number) => void;
  onProficiencyChange?: (n: number | null) => void;
  // 사냥 응답의 최신 경험치 진행도를 공유 레이아웃에도 반영해 화면 재진입 시 되돌아가지 않게 한다.
  onExperienceChange?: (update: ExperienceProgressUpdate) => void;
  // 사냥 응답의 최신 충전약 잔량을 공유 레이아웃 상태에도 반영한다. 페이지를 떠났다가
  // 브라우저 뒤로가기·앞으로가기로 재진입해도 화면 진입 당시의 오래된 값이 복원되지 않는다.
  onRecoveryChargesChange?: (update: RecoveryChargesUpdate) => void;
  // 사냥 결과에서 새로 발견한 희귀 탐사/장소로 즉시 이동.
  onEnterRareMap?: (map: RareMapInstance) => void;
  // 희귀 탐사와 같은 단계의 일반 사냥터로 즉시 복귀. 일반 사냥 모드에서는 사용하지 않는다.
  onReturnToNormalHunt?: () => void;
  // 오프라인 사냥 세션 상태(전역) + 시작/정지 후 me/state 재조회 콜백.
  offlineHunt?: { active: boolean; endsAt: number; depth: number } | null;
  onRefresh?: () => void | Promise<void>;
}) {
  // 이름은 테마명 + 3단계명(예 "들판 · 입구"). authored 층은 깊이 1(들판)
  // 하나뿐 — 그 객체(floor)는 권장 파워 조회용이고, 없으면 floorPowerGate(depth) 로 폴백한다.
  // ⚠️ floor 존재 ≠ 깊이 유효성(깊이 2~6 도 들판이지만 authored 층 없음). 유효성은 page 가 검증.
  const floor = MAIN_DUNGEON.floors.find((f) => f.id === floorId);
  const depth = Number(floorId);
  const displayName = huntStageName(depth);
  const powerGate = floor
    ? floor.requirement.kind === "power"
      ? floor.requirement.min
      : floorPowerGate(depth)
    : floorPowerGate(depth);
  // 내 전투력 — me/state 가 보낸 power(권장 파워와 동일 derivePowerScore 단위)라 직접 비교 가능.
  //   없으면(미로딩) 표시 생략. 난이도 지표는 빌드 간 환산 편차가 커 입장·경고 기준으로 쓰지 않는다.
  const myPower = playerCombat?.power ?? null;
  const readiness = dungeonReadiness({
    depth,
    frontierDepth,
    playerPower: myPower,
    recommendedPower: powerGate,
    jobTier: currentJobTier,
    level: currentLevel,
    levelCap: currentLevelCap,
  });
  const growthLabel = dungeonGrowthLabel({
    jobTier: currentJobTier,
    level: currentLevel,
    levelCap: currentLevelCap,
  });
  // 도전(미정복) 여부 — 최고 도달보다 다음 대표 단계가 깊다.
  const isChallenge = depth > frontierDepth;
  const { busy, lastResult, hunt, huntBatch } = useDungeonHunt({
    outpostId,
    setStamina,
    rareMapIid,
  });
  // 레어맵 남은 판수 — 단판/일괄 응답에서 갱신(서버 권위). null = 아직 응답 없음.
  const [rareMapRunsLeft, setRareMapRunsLeft] = useState<number | null>(null);
  const [rareMapSnapshot, setRareMapSnapshot] = useState<{
    map: RareMapInstance;
    serverNow: number;
  } | null>(null);
  const [rareMapExpired, setRareMapExpired] = useState(false);
  useEffect(() => {
    if (!rareMapIid) return;
    let alive = true;
    fetch("/api/v2/me/rare-maps")
      .then((response) => (response.ok ? response.json() : null))
      .then(
        (data: {
          ok?: boolean;
          rareMaps?: RareMapInstance[];
          serverNow?: number;
        } | null) => {
          if (!alive || !data?.ok) return;
          const map = (data.rareMaps ?? []).find(
            (candidate) => candidate.iid === rareMapIid,
          );
          if (
            !map ||
            typeof data.serverNow !== "number" ||
            !Number.isFinite(data.serverNow)
          ) {
            setRareMapExpired(true);
            onReturnToNormalHunt?.();
            return;
          }
          setRareMapSnapshot({ map, serverNow: data.serverNow });
          setRareMapRunsLeft(map.runsLeft);
        },
      )
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [onReturnToNormalHunt, rareMapIid]);
  // 일괄 사냥 상태.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchSummary, setBatchSummary] = useState<BatchSummary | null>(null);
  const [selectedBatchReplay, setSelectedBatchReplay] =
    useState<BatchReplayEntry | null>(null);
  // 연패 카운터 — 단판 사냥 결과마다 갱신(승=0 리셋·패=+1). 넛지 배너 격상 조건에 사용.
  const [lossStreak, setLossStreak] = useState(0);
  // 일괄 사냥 후 캐릭터 정보 카드용 — 서버 일괄 처리는 단판 lastResult 를 세우지 않으므로
  // 합산 응답의 마지막 상태(EXP 진행도·회복약 충전량)를 따로 담는다.
  const [batchStatus, setBatchStatus] = useState<{
    exp: number;
    maxExp: number;
    hpCharges?: number;
    mpCharges?: number;
    hasMp: boolean;
    proficiency?: number | null;
  } | null>(null);
  // 결과 카드는 새 요청을 시작할 때 비워지므로 EXP 표시까지 lastResult/batchStatus 에만
  // 의존하면 자동 사냥 요청 사이에 화면 진입 당시 값으로 잠깐 되돌아간다. 마지막으로 확인한
  // 서버 EXP를 별도로 유지해 요청 중에도 진행 바가 뒤로 움직이지 않게 한다.
  const [latestExpProgressState, setLatestExpProgressState] =
    useState<ExpProgressSnapshot>(() => ({
      baseExp: initialExp,
      baseMaxExp: initialMaxExp,
      exp: initialExp,
      maxExp: initialMaxExp,
    }));
  const latestExpProgress =
    latestExpProgressState.baseExp === initialExp &&
    latestExpProgressState.baseMaxExp === initialMaxExp
      ? latestExpProgressState
      : { exp: initialExp, maxExp: initialMaxExp };
  const [latestProficiencyState, setLatestProficiencyState] = useState<{
    base: number | null;
    value: number | null;
  }>(() => ({ base: playerProficiency, value: playerProficiency }));
  const latestProficiency =
    latestProficiencyState.base === playerProficiency
      ? latestProficiencyState.value
      : playerProficiency;
  const [latestRecoveryChargesState, setLatestRecoveryChargesState] =
    useState<RecoveryChargesSnapshot>(() => ({
      baseHpCharges: initialHpCharges,
      baseMpCharges: initialMpCharges,
      hpCharges: initialHpCharges,
      mpCharges: initialMpCharges,
    }));
  const latestHpCharges =
    latestRecoveryChargesState.baseHpCharges === initialHpCharges &&
    latestRecoveryChargesState.baseMpCharges === initialMpCharges
      ? latestRecoveryChargesState.hpCharges
      : initialHpCharges;
  const latestMpCharges =
    latestRecoveryChargesState.baseHpCharges === initialHpCharges &&
    latestRecoveryChargesState.baseMpCharges === initialMpCharges
      ? latestRecoveryChargesState.mpCharges
      : initialMpCharges;
  const statusExp =
    lastResult?.expAfter ?? batchStatus?.exp ?? latestExpProgress.exp;
  const statusMaxExp =
    lastResult?.maxExpAfter ?? batchStatus?.maxExp ?? latestExpProgress.maxExp;
  const statusHpCharges =
    lastResult?.hpCharges ?? batchStatus?.hpCharges ?? latestHpCharges;
  const statusMpCharges =
    lastResult?.mpCharges ?? batchStatus?.mpCharges ?? latestMpCharges;
  // "직업 숙련도" 상시 readout — 최신 사냥값(단판 masteryAfter / 일괄 proficiencyAfter) 우선,
  //   없으면 화면 진입 시점 값(playerProficiency). null = 모험가(무직업) → 카드에서 줄 생략.
  const statusProficiency =
    lastResult?.masteryAfter ?? batchStatus?.proficiency ?? latestProficiency;
  // 선택한 사냥 횟수 — 메인 버튼이 단판/일괄을 이 값으로 결정. 기본 1(단판).
  const [huntCount, setHuntCount] = useState<HuntCount>(1);
  const huntCounts = huntCountsForAdventureSupport(adventureSupportActive);
  // 저장된 기본값 로드(마운트 1회). SSR/hydration mismatch 피하려 default 1 후 effect 에서 적용
  // (useAutoPotionConfig 와 동일 패턴 — 클라 전용 localStorage 하이드레이션).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHuntCount(loadHuntCount(adventureSupportActive));
  }, [adventureSupportActive]);

  // HP 게이트용 1초 틱 — 시간 재생으로 회복되면 사냥 버튼이 자동 재활성된다. (HpBar 와 같은 패턴)
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // 두 개의 ref 를 early-return 앞에서 잡아 최신 핸들러를 참조한다(아래에서 매 렌더 갱신):
  //   - triggerHuntRef = 단판 사냥. 자동 사냥 루프 인터벌이 이걸 반복 호출(토글이 아니라 한 판).
  //   - huntButtonRef  = 사냥 버튼/스페이스바 동작. 코어루프 on 이면 "루프 토글"(누르면 켜고
  //     다시 누르면 끔), off 면 단판/일괄. 인터벌이 이걸 호출하면 첫 틱에 꺼지므로 분리한다.
  const triggerHuntRef = useRef<() => void>(() => {});
  const huntButtonRef = useRef<() => void>(() => {});
  // 단판 사냥 동시 제출 차단 — busy 가 리렌더에 반영되기 전 한 프레임 내 중복 호출 시 사냥이
  //   겹쳐 결과 순서(lastResult·연패 카운터)가 꼬이는 것을 동기적으로 막는다. 결과 수신 시 해제.
  const huntInFlightRef = useRef(false);
  // 스태미너 회복 시점 서버 재조회 중복 차단 — 버튼은 서버가 돌려준 stamina 로만 다시 활성화한다.
  const staminaReadyRefreshInFlightRef = useRef(false);
  const staminaReadyRefreshKeyRef = useRef<string | null>(null);
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
      huntButtonRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 자동 사냥 루프 — 사냥 버튼을 길게 누르면 켜진다(두 모드 공용). 켜져 있으면 1.5초마다 발동.
  //   쿨다운/처리중 가드는 triggerHunt 내부라 일시 조건이면 no-op(풀리면 재개). 스태미나·체력
  //   소진이면 triggerHunt 가 자동 정지. 서버 거부·언마운트도 정지.
  const [autoHunt, setAutoHunt] = useState(false);
  const [autoStopReason, setAutoStopReason] =
    useState<HuntEndReason | null>(null);
  const {
    config: autoStopConfig,
    configRef: autoStopConfigRef,
    updateConfig: updateAutoStopConfig,
  } = useAutoHuntStopConfig();
  useEffect(() => {
    if (!autoHunt) return;
    const id = setInterval(() => triggerHuntRef.current(), 1500);
    return () => clearInterval(id);
  }, [autoHunt]);
  // 자동 사냥(오프라인 세션)과 직접 사냥은 상호 배타 — 세션이 켜지면 온라인 루프를 멈춘다.
  const offlineSessionActive = !!offlineHunt?.active;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 오프라인 사냥 세션 시작 시 온라인 자동사냥 중단
    if (offlineSessionActive) setAutoHunt(false);
  }, [offlineSessionActive]);
  // 오프라인 사냥 세션 시작/정지 진행 중 플래그 + 정지 정산 결과 한 줄.
  const [offlineBusy, setOfflineBusy] = useState(false);
  const [offlineMsg, setOfflineMsg] = useState<string | null>(null);
  const startOffline = async () => {
    const stopReason = getAutoHuntStopReason(autoStopConfigRef.current, {
      hpCharges: statusHpCharges,
      mpCharges: statusMpCharges,
      hasMp: (mp?.maxMp ?? 0) > 0,
      rareMapFound: false,
      level: currentLevel,
    });
    if (stopReason) {
      setAutoStopReason(stopReason);
      return;
    }
    setOfflineBusy(true);
    setOfflineMsg(null);
    setAutoHunt(false); // 온라인 루프와 상호 배타 — 자동 사냥 시작 시 즉시 정지.
    try {
      const res = await fetch("/api/v2/me/offline-hunt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "start",
          autoStopConfig: autoStopConfigRef.current,
        }),
      });
      if (!res.ok) {
        setOfflineMsg("오프라인 사냥 시작에 실패했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      // refresh 가 끝날 때까지 offlineBusy 유지 → offlineSessionActive 가 반영되기 전 틈에
      //   온라인 사냥이 다시 켜지는 레이스 차단(사냥 버튼/onHuntPress 는 offlineBusy 도 잠금).
      await onRefresh?.();
    } catch {
      setOfflineMsg("오프라인 사냥 시작에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setOfflineBusy(false);
    }
  };
  const stopOffline = async () => {
    setOfflineBusy(true);
    try {
      // 먼저 누적분 정산(결과는 한 줄로 표기) → 세션 종료.
      const j = await settleOfflineHuntBatches();
      const stopRes = await fetch("/api/v2/me/offline-hunt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });
      if (!stopRes.ok) {
        setOfflineMsg("정산은 됐지만 세션 종료에 실패했어요. 다시 정지를 눌러 주세요.");
        onRefresh?.();
        return;
      }
      setOfflineMsg(
        j.battles > 0
          ? `오프라인 사냥 정산 — ${j.battles}판 · 경험치 +${j.totalExp.toLocaleString()} · 골드 +${j.totalGold.toLocaleString()}${j.totalProficiency > 0 ? ` · 숙달 포인트 +${j.totalProficiency.toLocaleString()}` : ""}${j.totalMastery > 0 ? ` · 직업 숙련도 +${j.totalMastery.toLocaleString()}` : ""}${offlineSettleStopReasonLabel(j.stoppedReason) ? ` · ${offlineSettleStopReasonLabel(j.stoppedReason)}` : ""}`
          : "오프라인 사냥 정지 (정산할 누적 없음)",
      );
      onRefresh?.();
    } catch {
      setOfflineMsg("정산에 실패했어요. 누적은 보존되며 잠시 후 다시 시도할 수 있어요.");
    } finally {
      setOfflineBusy(false);
    }
  };

  // 사냥 응답의 최종 HP 로 전역 HP 갱신 — anchor = 지금(응답 수신 시각 ≈ 서버 now).
  const recordHp = (r: { hpAfter: number; maxHp: number }) => {
    setHp?.({ hp: r.hpAfter, maxHp: r.maxHp, anchorMs: Date.now() });
  };
  const recordMp = (r: { mpAfter?: number; maxMp?: number }) => {
    if (typeof r.mpAfter === "number" && typeof r.maxMp === "number") {
      setMp?.({ mp: r.mpAfter, maxMp: r.maxMp });
    }
  };

  const { state: storyFlags, set: setStoryFlag } = useStoryFlags();

  const showLevelupModal =
    !!lastResult &&
    lastResult.levelsGained > 0 &&
    storyFlags.flags.includes(TUTORIAL_ENABLED_FLAG) &&
    !storyFlags.flags.includes(TUTORIAL_V2_FIRST_LEVELUP);

  // 일괄 사냥 — 서버가 count 회를 한 트랜잭션으로 처리(한 왕복, 딸깍). 합산 결과만 받아 표시 +
  //   최종 HP/깊이/레벨을 한 번만 반영(옛 클라 50회 루프·드르륵 카운터 폐기).
  const runBatch = async (count: number, autoRun = false) => {
    setSettingsOpen(false);
    setBatchSummary(null);
    setSelectedBatchReplay(null);
    setBatchStatus(null);
    setBatchRunning(true);
    try {
      const b = await huntBatch(
        depth,
        count,
        // 짧게 눌러 실행하는 5/10/50회 일괄 사냥도 여러 전투를 한 요청에서 처리하므로
        // 정지 조건을 반드시 서버에 보낸다. autoRun은 일괄 완료 후 다음 묶음 반복 여부일 뿐,
        // 현재 묶음 안의 레벨/포션/희귀맵 정지 조건 적용 여부가 아니다.
        autoStopConfigRef.current,
      );
      if (!b) {
        // 자동 사냥 중 실패하면 같은 요청을 무한 반복하지 않는다(단판과 동일 동작).
        if (autoRun) {
          setAutoHunt(false);
          setAutoStopReason("request_failed");
        }
        return; // 네트워크/서버 오류 — hook 이 로그 남김. 요약 없이 종료.
      }
      setBatchSummary({
        attempted: b.attempted,
        completed: b.completed,
        wins: b.wins,
        losses: b.losses,
        totalExp: b.totalExp,
        totalProficiency: b.totalProficiency,
        proficiencyPointsAfter: b.proficiencyPointsAfter,
        totalMastery: b.totalMastery,
        proficiencyAfter: b.proficiencyAfter,
        totalGold: b.totalGold,
        totalLossTax: b.totalLossTax,
        finalGoldAfter: b.finalGoldAfter,
        expAfter: b.expAfter,
        levelsGained: b.levelsGained,
        statGains: b.statGains,
        hpGained: b.hpGained,
        mpGained: b.mpGained,
        drops: b.drops,
        droppedEquipments: b.droppedEquipments,
        droppedUniques: b.droppedUniques,
        rareMapDrops: b.rareMapDrops,
        rareMapDropInstances: b.rareMapDropInstances,
        stoppedReason: b.stoppedReason,
        replays: b.replays,
      });
      if (b.rareMapRunsLeft != null) setRareMapRunsLeft(b.rareMapRunsLeft);
      if (typeof b.finalGoldAfter === "number") onGoldChange?.(b.finalGoldAfter);
      if (b.proficiencyAfter !== undefined) {
        setLatestProficiencyState({
          base: playerProficiency,
          value: b.proficiencyAfter,
        });
        onProficiencyChange?.(b.proficiencyAfter);
      }
      if (b.hpCharges != null || b.mpCharges != null) {
        setLatestRecoveryChargesState((prev) =>
          nextRecoveryChargesSnapshot({
            prev,
            initialHpCharges,
            initialMpCharges,
            hpCharges: b.hpCharges,
            mpCharges: b.mpCharges,
          }),
        );
        const update = recoveryChargesUpdate(b.hpCharges, b.mpCharges);
        if (update) onRecoveryChargesChange?.(update);
      }
      // 캐릭터 정보 카드 — 합산 후 현재 EXP 진행도·회복약 충전량(마지막 사냥 상태).
      setBatchStatus({
        exp: b.expAfter ?? 0,
        maxExp: b.maxExpAfter ?? 1,
        hpCharges: b.hpCharges ?? undefined,
        mpCharges: b.mpCharges ?? undefined,
        hasMp: (b.playerMaxMp ?? 0) > 0,
        proficiency: b.proficiencyAfter ?? null,
      });
      if (typeof b.expAfter === "number" && typeof b.maxExpAfter === "number") {
        setLatestExpProgressState({
          baseExp: initialExp,
          baseMaxExp: initialMaxExp,
          exp: b.expAfter,
          maxExp: b.maxExpAfter,
        });
        const update = experienceProgressUpdate(b.expAfter, b.maxExpAfter);
        if (update) onExperienceChange?.(update);
      }
      // 부수효과 — 서버가 합산해 준 마지막 상태로 한 번만.
      if (b.finalHpAfter != null && b.finalMaxHp != null) {
        recordHp({ hpAfter: b.finalHpAfter, maxHp: b.finalMaxHp });
      }
      if (b.finalMpAfter != null && b.playerMaxMp != null) {
        recordMp({ mpAfter: b.finalMpAfter, maxMp: b.playerMaxMp });
      }
      if (
        isChallenge &&
        b.finalMaxDepth != null &&
        b.finalMaxDepth > frontierDepth
      ) {
        onFrontierUnlocked?.(b.finalMaxDepth);
      }
      if (b.levelsGained > 0) onLevelUp?.();
      if (autoRun) {
        const serverStopReason: HuntEndReason | null =
          b.stoppedReason === "stamina" ||
          b.stoppedReason === "death" ||
          b.stoppedReason === "recovery" ||
          b.stoppedReason === "error" ||
          b.stoppedReason === "potion" ||
          b.stoppedReason === "rare_map" ||
          b.stoppedReason === "level_100"
            ? b.stoppedReason
            : rareMapIid && (b.rareMapRunsLeft ?? 0) <= 0
              ? "rare_map_exhausted"
              : null;
        const stopReason =
          serverStopReason ??
          getAutoHuntStopReason(autoStopConfigRef.current, {
            hpCharges: b.hpCharges ?? statusHpCharges,
            mpCharges: b.mpCharges ?? statusMpCharges,
            hasMp: (b.playerMaxMp ?? mp?.maxMp ?? 0) > 0,
            rareMapFound: (b.rareMapDrops ?? []).some(
              (kind) => RARE_MAP_KINDS[kind]?.category === "hunt",
            ),
            level: b.finalLevelAfter ?? currentLevel + b.levelsGained,
          });
        if (stopReason) {
          setAutoHunt(false);
          setAutoStopReason(stopReason);
        }
      }
    } finally {
      setBatchRunning(false);
    }
  };

  // 코어루프 on(쿨다운 객체 전달됨) = 스태미나 폐지·전투 쿨다운 게이트. off/dev = 기존 스태미나.
  const coreLoopOn = combatCooldown != null;
  const onCooldown = combatCooldown != null && now < combatCooldown.nextBattleAt;
  const cooldownLeftSec = onCooldown
    ? Math.ceil((combatCooldown.nextBattleAt - now) / 1000)
    : 0;
  const staminaCurrent = stamina.current;
  const staminaLastUpdatedAt = stamina.lastUpdatedAt;
  const staminaRegenBonusPct = adventureSupportActive
    ? ADVENTURE_SUPPORT_PASS.staminaRegenBonusPct
    : 0;
  const lowStamina = !coreLoopOn && staminaCurrent < HUNT_COST;
  useEffect(() => {
    if (coreLoopOn || !onRefresh || staminaCurrent >= HUNT_COST) {
      staminaReadyRefreshKeyRef.current = null;
      return;
    }

    const waitMs = msUntilStaminaAtLeast(
      { current: staminaCurrent, lastUpdatedAt: staminaLastUpdatedAt },
      HUNT_COST,
      Date.now(),
      staminaMax,
      staminaRegenBonusPct,
    );
    if (!Number.isFinite(waitMs)) return;

    const id = window.setTimeout(() => {
      const refreshKey = `${staminaCurrent}:${staminaLastUpdatedAt}:${staminaMax}:${staminaRegenBonusPct}`;
      if (
        staminaReadyRefreshInFlightRef.current ||
        staminaReadyRefreshKeyRef.current === refreshKey
      ) {
        return;
      }
      staminaReadyRefreshInFlightRef.current = true;
      staminaReadyRefreshKeyRef.current = refreshKey;
      void Promise.resolve(onRefresh()).finally(() => {
        staminaReadyRefreshInFlightRef.current = false;
      });
    }, waitMs + 100);

    return () => window.clearTimeout(id);
  }, [
    coreLoopOn,
    onRefresh,
    staminaCurrent,
    staminaLastUpdatedAt,
    staminaMax,
    staminaRegenBonusPct,
  ]);
  const oneActionDisabled = busy || batchRunning;
  // 라이브 HP(시간 재생 반영) 기준 회복 필요 여부 — 5% 미만이면 사냥 차단(서버와 동일 기준).
  // hp 미로딩(null)이면 게이트 비활성 — 서버 가드가 최종 차단.
  const liveHp = hp
    ? applyHpRegen(hp.hp, Math.max(1, hp.maxHp), hp.anchorMs, now).hp
    : null;
  const needsRecovery =
    hp != null && liveHp != null && !canHuntWithHp(liveHp, hp.maxHp);
  // 패배 넛지 — "졌는지 모르고 계속 사냥" 방지. 직전 단판 패배 / 일괄 패배 포함 / 연패 2회+ 일 때
  //   사냥 버튼 위에 경고를 띄운다. needsRecovery(<5%) 면 그쪽 전용 배너가 우선이라 중복 회피.
  const justLostSingle = !batchSummary && !!lastResult && !lastResult.won;
  const justLostBatch =
    !!batchSummary &&
    (batchSummary.stoppedReason === "death" ||
      (batchSummary.losses ?? 0) > 0);
  const showDefeatNudge =
    !needsRecovery &&
    (justLostSingle || justLostBatch || (lossStreak >= 2 && !batchSummary));
  // 자동 사냥 세션과 직접 사냥 상호 배타 — 세션 활성 OR 시작/정지 처리 중이면 사냥 버튼 잠금.
  //   offlineBusy 까지 포함해 "시작 직후 refresh 반영 전" 틈에 온라인 루프가 켜지는 레이스 차단.
  const offlineLocked = offlineSessionActive || offlineBusy;

  // 메인 사냥 버튼 발동(클릭·스페이스바 공용). 비활성 조건에선 무발동.
  //   레벨업 모달이 열렸으면 무발동 — 스페이스바 전역 리스너가 모달 오버레이를 우회해 뒤에서
  //   사냥이 돌지 않게(클릭은 오버레이가 막지만 키는 막지 못함).
  const triggerHunt = (autoRun = false) => {
    // 일시적 차단(처리 중·쿨다운·레벨업 모달)은 자동 사냥을 유지 — 풀리면 다음 틱에 재개.
    if (oneActionDisabled || onCooldown || showLevelupModal) return;
    // 설정을 켠 시점에 이미 포션/레벨 조건을 만족했다면 다음 판을 시작하지 않는다.
    if (autoRun) {
      const stopReason = getAutoHuntStopReason(autoStopConfigRef.current, {
        hpCharges: statusHpCharges,
        mpCharges: statusMpCharges,
        hasMp: (mp?.maxMp ?? 0) > 0,
        rareMapFound: false,
        level: currentLevel,
      });
      if (stopReason) {
        setAutoHunt(false);
        setAutoStopReason(stopReason);
        return;
      }
    }
    // 스태미나·체력 소진은 더 못 싸우는 상태 → 자동 사냥 정지(빈 인터벌 무한 반복 방지).
    if (lowStamina || needsRecovery) {
      setAutoHunt(false);
      if (autoRun) {
        setAutoStopReason(lowStamina ? "stamina" : "recovery");
      }
      return;
    }
    setBatchSummary(null);
    setSelectedBatchReplay(null);
    // 코어루프 on = 항상 단판(일괄 폐지 — 누적은 오프라인 정산). 스태미나 모드는
    // 수동/자동 모두 설정한 huntCount 를 반영한다.
    if (coreLoopOn || huntCount === 1) {
      // 이미 한 판이 진행 중이면 무발동(동시 제출 차단). hunt 결과 .then 에서 해제.
      if (huntInFlightRef.current) return;
      huntInFlightRef.current = true;
      setBatchStatus(null);
      void hunt(depth, autoStopConfigRef.current).then((r) => {
        huntInFlightRef.current = false;
        if (r) {
          if (
            typeof r.expAfter === "number" &&
            typeof r.maxExpAfter === "number"
          ) {
            setLatestExpProgressState({
              baseExp: initialExp,
              baseMaxExp: initialMaxExp,
              exp: r.expAfter,
              maxExp: r.maxExpAfter,
            });
            const update = experienceProgressUpdate(
              r.expAfter,
              r.maxExpAfter,
            );
            if (update) onExperienceChange?.(update);
          }
          // 연패 추적 — 승리면 리셋, 패배면 누적(넛지 배너 격상용).
          setLossStreak((s) => (r.won ? 0 : s + 1));
          recordHp(r);
          recordMp(r);
          if (r.rareMapRunsLeft != null) setRareMapRunsLeft(r.rareMapRunsLeft);
          if (typeof r.goldAfter === "number") onGoldChange?.(r.goldAfter);
          if (r.masteryAfter !== undefined) {
            setLatestProficiencyState({
              base: playerProficiency,
              value: r.masteryAfter,
            });
            onProficiencyChange?.(r.masteryAfter);
          }
          if (r.hpCharges != null || r.mpCharges != null) {
            setLatestRecoveryChargesState((prev) =>
              nextRecoveryChargesSnapshot({
                prev,
                initialHpCharges,
                initialMpCharges,
                hpCharges: r.hpCharges,
                mpCharges: r.mpCharges,
              }),
            );
            const update = recoveryChargesUpdate(r.hpCharges, r.mpCharges);
            if (update) onRecoveryChargesChange?.(update);
          }
          if (r.levelsGained > 0) onLevelUp?.();
          if (
            isChallenge &&
            r.won &&
            r.maxDepth != null &&
            r.maxDepth > frontierDepth
          ) {
            onFrontierUnlocked?.(r.maxDepth);
          }
          // 코어루프 — 다음 판까지 전투 쿨다운 시작(낙관적) + 위험 골드 뱃지 갱신.
          if (coreLoopOn) {
            setCombatCooldown?.({
              nextBattleAt: Date.now() + HUNT_COOLDOWN_MS,
              cooldownMs: HUNT_COOLDOWN_MS,
            });
            if (r.atRiskGold != null) setAtRiskGold?.(r.atRiskGold);
          }
          if (autoRun) {
            const configuredStopReason = getAutoHuntStopReason(
              autoStopConfigRef.current,
              {
                hpCharges: r.hpCharges ?? statusHpCharges,
                mpCharges: r.mpCharges ?? statusMpCharges,
                hasMp: (r.maxMp ?? mp?.maxMp ?? 0) > 0,
                rareMapFound:
                  !!r.rareMapDrop &&
                  RARE_MAP_KINDS[r.rareMapDrop]?.category === "hunt",
                level: r.levelAfter ?? currentLevel + r.levelsGained,
              },
            );
            const stopReason: HuntEndReason | null =
              configuredStopReason ??
              (rareMapIid && (r.rareMapRunsLeft ?? 0) <= 0
                ? "rare_map_exhausted"
                : r.hpAfter <= 0
                  ? "death"
                  : !canHuntWithHp(r.hpAfter, r.maxHp)
                    ? "recovery"
                    : null);
            if (stopReason) {
              setAutoHunt(false);
              setAutoStopReason(stopReason);
            }
          }
        } else {
          // 사냥이 서버에서 거부됨(depth_locked·policy_blocked·hp_zero 등) — 실패 시
          // 쿨다운이 안 잡혀 자동 사냥이 1.5초마다 무한 재시도할 수 있으니 즉시 정지.
          // (성공 흐름은 낙관적 쿨다운으로 자연히 간격을 둔다.)
          setAutoHunt(false);
          if (autoRun) setAutoStopReason("request_failed");
        }
      });
    } else {
      void runBatch(huntCount, autoRun);
    }
  };

  // 사냥 버튼/스페이스바 — 코어루프: 탭(짧게)=단판, 길게(0.5s)=자동 연속. 자동 중엔 탭=정지.
  //   off 모드는 기존 단판/일괄(triggerHunt).
  const LONG_PRESS_MS = 500;
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const cancelLongPress = () => {
    if (longPressTimer.current != null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };
  // 언마운트 시 타이머 정리 — press 중 화면을 떠나도 unmounted setState 안 나게.
  useEffect(
    () => () => {
      if (longPressTimer.current != null) clearTimeout(longPressTimer.current);
    },
    [],
  );
  const startAutoHunt = () => {
    // 스태미나 모드에서도 자동 사냥 허용(coreLoopOn 게이트 제거). 능동적 길게누르기라 방치
    //   자동전투(#840 우려)와 무관하고, 스태미나·체력으로 자연 제한된다(소진 시 triggerHunt 정지).
    if (offlineLocked || autoHunt) return;
    const stopReason = getAutoHuntStopReason(autoStopConfigRef.current, {
      hpCharges: statusHpCharges,
      mpCharges: statusMpCharges,
      hasMp: (mp?.maxMp ?? 0) > 0,
      rareMapFound: false,
      level: currentLevel,
    });
    if (stopReason) {
      setAutoStopReason(stopReason);
      return;
    }
    setAutoStopReason(null);
    setAutoHunt(true);
    triggerHunt(true); // 1.5초 인터벌을 기다리지 않고 첫 판 즉시.
  };
  // 탭(짧게) — 자동 중이면 정지, 아니면 단판/일괄(huntCount). 두 모드 공용.
  const tapHunt = () => {
    if (offlineLocked) return;
    if (autoHunt) {
      setAutoHunt(false);
      return;
    }
    setAutoStopReason(null);
    triggerHunt();
  };
  // 버튼 click — 길게 눌러 자동이 막 시작됐으면 뒤따르는 click 무시(중복 단판 방지), 아니면 탭.
  const onHuntClick = () => {
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    tapHunt();
  };
  // 누르기 시작 → 0.5초 유지하면 자동 시작(두 모드 공용). 자동 중·잠금이면 길게 무의미(탭만 동작).
  const onHuntPressStart = () => {
    longPressFired.current = false;
    if (offlineLocked || autoHunt) return;
    cancelLongPress();
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      startAutoHunt();
    }, LONG_PRESS_MS);
  };
  // 최신 핸들러를 ref 에 동기화 — 매 렌더 후 effect 에서 갱신(렌더 중 ref 변경 회피).
  //   keydown/인터벌 리스너는 stable 클로저([],[autoHunt])라 ref.current 로 항상 최신
  //   triggerHunt/onHuntPress 를 호출한다. dep array 없음 = 매 렌더 후 동기화(의도).
  useEffect(() => {
    triggerHuntRef.current = () => triggerHunt(true);
    // 스페이스바 = 탭(단판). 자동은 버튼 길게 누르기로(키보드는 길게 개념 없음).
    huntButtonRef.current = tapHunt;
  });

  // 알 수 없는 구역 — 유효하지 않은 깊이(0·음수·NaN)만 방어한다. (정상 경로는 page 가 1~MAX
  //   범위를 이미 검증·notFound. authored 층 유무로 막던 옛 가드 `!floor && depth<3` 은 들판
  //   2~6 처럼 authored 층 없는 정상 깊이까지 막는 버그라 깊이-유효성 검사로 교체.) 모든 hook
  //   뒤에서 조건부 렌더(rules-of-hooks) — 위 파생 const/핸들러는 floor 미사용이라 no-op.
  if (!Number.isInteger(depth) || depth < 1) {
    return (
      <main className="mx-auto max-w-[720px] space-y-4 p-6">
        <BackButton onClick={onBack} />
        <div className="text-sm text-rose-600 dark:text-rose-400">
          알 수 없는 구역입니다.
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[720px] space-y-4 px-4 py-5 text-zinc-900 sm:p-6 dark:text-zinc-100">
      <SubViewHeader
        title={
          <>
            {displayName}
            {isChallenge && (
              <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-sm font-normal text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                도전
              </span>
            )}
          </>
        }
        onBack={onBack}
        right={
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {outpostName}
          </span>
        }
      />
      <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
        {myPower != null && (
          <>
            내 전투력{" "}
            <span className="font-semibold tabular-nums text-zinc-700 dark:text-zinc-200">
              {myPower.toLocaleString()}
            </span>
            {" · "}
          </>
        )}
        난이도 지표{" "}
        <span className="tabular-nums">{powerGate.toLocaleString()}</span>
      </p>
      <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
        {growthLabel && <>{growthLabel} · </>}
        <span
          className={
            readiness.tone === "positive"
              ? "font-medium text-emerald-600 dark:text-emerald-400"
              : readiness.tone === "warning"
                ? "font-medium text-amber-600 dark:text-amber-400"
                : "font-medium text-zinc-600 dark:text-zinc-300"
          }
        >
          {readiness.label}
        </span>
      </p>
      {rareMapIid && rareMapExpired ? (
        <DiscoveryNotice kind="hunt" align="start">
          희귀 탐사 시간이 만료되어 일반 사냥터로 이동합니다.
        </DiscoveryNotice>
      ) : rareMapIid && rareMapSnapshot ? (
        <RareMapProgressNotice
          map={{
            ...rareMapSnapshot.map,
            runsLeft: rareMapRunsLeft ?? rareMapSnapshot.map.runsLeft,
          }}
          serverNow={rareMapSnapshot.serverNow}
          onReturnToNormalHunt={onReturnToNormalHunt}
          onExpire={() => {
            setRareMapExpired(true);
            onReturnToNormalHunt?.();
          }}
        />
      ) : rareMapIid ? (
        <DiscoveryNotice
          kind="hunt"
          align="start"
          action={
            onReturnToNormalHunt ? (
              <Button
                size="xs"
                variant="info"
                onClick={onReturnToNormalHunt}
                className="shrink-0"
              >
                일반 사냥터로
              </Button>
            ) : undefined
          }
        >
          희귀 탐사 진행 중
          {rareMapRunsLeft != null && ` — 남은 ${rareMapRunsLeft}판`}
        </DiscoveryNotice>
      ) : null}

      {autoStopReason && (
        <StatusBanner tone="warning" role="status" className="py-2.5">
          <span className="font-semibold">자동 사냥 종료.</span>{" "}
          {huntEndReasonText(autoStopReason, autoStopConfig.potionThreshold)}
          {!coreLoopOn && (
            <> · 남은 스태미너 {staminaCurrent.toLocaleString()}</>
          )}
        </StatusBanner>
      )}

      {/* 캐릭터 정보 — 전투 버튼 위 상시 노출. 첫 사냥 전에도 EXP/회복약 행을 유지해 버튼
          클릭 때 카드 높이가 바뀌지 않게 한다. */}
      {hp && (
        <PlayerStatusCard
          gender={playerGender}
          name={playerName}
          subtitle={playerSubtitle}
          hp={hp}
          mp={mp}
          exp={statusExp}
          maxExp={statusMaxExp}
          hpCharges={statusHpCharges}
          mpCharges={statusMpCharges}
          hasMp={(mp?.maxMp ?? 0) > 0}
          combat={playerCombat}
          primaryAttack={playerPrimaryAttack}
          proficiency={statusProficiency}
        />
      )}

      {showDefeatNudge && (
        <div className="rounded-md border border-rose-300 bg-rose-50 px-4 py-3 dark:border-rose-800 dark:bg-rose-950">
          <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">
            {lossStreak >= 2
              ? `${lossStreak}연패로 사냥이 멈췄습니다.`
              : "패배로 사냥이 멈췄습니다."}
          </p>
          <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
            다시 시도할 수 있지만, 같은 사냥터에서 패배가 반복될 수 있습니다.
          </p>
        </div>
      )}

      <Card padding="md" className="sticky bottom-3 z-20 shadow-lg sm:static sm:shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <button
            type="button"
            onClick={onHuntClick}
            // 길게 누르기(0.5s) = 자동 연속 사냥. 탭 = 단판. 포인터 이탈/취소 시 타이머 정리.
            onPointerDown={onHuntPressStart}
            onPointerUp={cancelLongPress}
            onPointerLeave={cancelLongPress}
            onPointerCancel={cancelLongPress}
            onContextMenu={(e) => e.preventDefault()}
            // 코어루프 — 자동 사냥(오프라인 세션) 중이면 직접 사냥 잠금. 온라인 루프 중이면
            //   "멈추기" 버튼이라 항상 클릭 가능(쿨다운/회복 중에도).
            disabled={
              coreLoopOn && offlineLocked
                ? true
                : autoHunt
                  ? false
                  : oneActionDisabled ||
                    lowStamina ||
                    needsRecovery ||
                    onCooldown
            }
            aria-pressed={autoHunt}
            className={`ui-game-button flex-1 select-none touch-manipulation rounded-md border px-3 py-2.5 text-sm font-medium text-white ${
              autoHunt && !offlineLocked
                ? "border-rose-600 bg-rose-600 hover:bg-rose-700"
                : "border-emerald-600 bg-emerald-600 hover:bg-emerald-700"
            } ${
              coreLoopOn
                ? "disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-400 dark:disabled:border-zinc-700 dark:disabled:bg-zinc-700"
                : "disabled:opacity-50"
            }`}
          >
            {coreLoopOn && offlineLocked
              ? "오프라인 사냥 중 — 정지하면 직접 사냥"
              : autoHunt
                ? busy
                  ? "사냥 중… (누르면 멈춤)"
                  : onCooldown
                    ? `사냥 중… (${cooldownLeftSec}초 · 누르면 멈춤)`
                    : "사냥 중지"
                : batchRunning || busy
                  ? "사냥 중…"
                  : needsRecovery
                    ? "회복 필요"
                    : onCooldown
                      ? `다음 사냥까지 ${cooldownLeftSec}초`
                      : coreLoopOn
                        ? "사냥 (길게 눌러 자동)"
                        : huntCount === 1
                          ? "사냥 (길게 눌러 자동 · 스태미너 1)"
                          : `${huntCount}회 사냥 (스태미너 ${huntCount})`}
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen((o) => !o)}
            disabled={batchRunning}
            aria-label="전투 설정"
            aria-expanded={settingsOpen}
            className="ui-game-button flex shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 sm:w-auto dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <Gear size={16} weight="duotone" />
          </button>
        </div>
        {settingsOpen && (
          <div className="mt-3 space-y-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
            {!coreLoopOn && (
              <div className="space-y-2">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  사냥 횟수 — 고른 만큼 사냥 버튼이 한 번에 처리합니다.
                </p>
                <div className="flex gap-2">
                  {huntCounts.map((n) => {
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
                        className={`ui-game-button flex-1 rounded-md border px-3 py-2 text-sm transition-colors disabled:opacity-50 ${
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

            <div className={`${SURFACE_INSET} space-y-2 p-3`}>
              <div className="flex items-center justify-between gap-3">
                <label
                  htmlFor="hp-potion-target"
                  className="text-sm font-medium"
                >
                  HP 충전약 사용 목표
                </label>
                <span className="text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                  {autoStopConfig.hpPotionTargetPct === 0
                    ? "사용 안 함"
                    : `체력 ${autoStopConfig.hpPotionTargetPct}%`}
                </span>
              </div>
              <input
                id="hp-potion-target"
                type="range"
                min={0}
                max={100}
                step={5}
                value={autoStopConfig.hpPotionTargetPct}
                onChange={(e) =>
                  updateAutoStopConfig({
                    hpPotionTargetPct: Number(e.target.value),
                  })
                }
                aria-label="HP 충전약 사용 목표 체력"
                aria-valuetext={
                  autoStopConfig.hpPotionTargetPct === 0
                    ? "사용 안 함"
                    : `체력 ${autoStopConfig.hpPotionTargetPct}%까지`
                }
                className="w-full accent-emerald-600"
              />
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                사냥 후 HP 충전약을 설정한 체력까지만 사용합니다. 체력이
                너무 낮아 사냥 전에 자동 회복할 때도 같은 기준을 적용합니다.
              </p>

              <div className="space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                <div className="flex items-center justify-between gap-3">
                  <label
                    htmlFor="mp-potion-target"
                    className="text-sm font-medium"
                  >
                    MP 충전약 사용 목표
                  </label>
                  <span className="text-sm font-semibold tabular-nums text-sky-700 dark:text-sky-300">
                    {autoStopConfig.mpPotionTargetPct === 0
                      ? "사용 안 함"
                      : `마나 ${autoStopConfig.mpPotionTargetPct}%`}
                  </span>
                </div>
                <input
                  id="mp-potion-target"
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={autoStopConfig.mpPotionTargetPct}
                  onChange={(e) =>
                    updateAutoStopConfig({
                      mpPotionTargetPct: Number(e.target.value),
                    })
                  }
                  aria-label="MP 충전약 사용 목표 마나"
                  aria-valuetext={
                    autoStopConfig.mpPotionTargetPct === 0
                      ? "사용 안 함"
                      : `마나 ${autoStopConfig.mpPotionTargetPct}%까지`
                  }
                  className="w-full accent-sky-600"
                />
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  사냥 후 MP 충전약을 설정한 마나까지만 사용합니다.
                </p>
              </div>
            </div>

            <div className={`${SURFACE_INSET} space-y-3 p-3`}>
              <div>
                <p className="text-sm font-medium">
                  일괄·자동·오프라인 사냥 정지 조건
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                  선택한 조건을 만족한 전투가 끝나면 일괄·자동·오프라인
                  사냥을 멈춥니다.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <label className="flex min-w-0 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={autoStopConfig.potionEnabled}
                      onChange={(e) =>
                        updateAutoStopConfig({ potionEnabled: e.target.checked })
                      }
                      className="size-4 accent-emerald-600"
                    />
                    <span>충전약 잔량</span>
                  </label>
                  <span className="flex items-center gap-1 text-sm">
                    <DraftNumberInput
                      min={0}
                      max={9_999_999}
                      step={1}
                      value={autoStopConfig.potionThreshold}
                      disabled={!autoStopConfig.potionEnabled}
                      onValueChange={(potionThreshold) =>
                        updateAutoStopConfig({
                          potionThreshold,
                        })
                      }
                      aria-label="자동 사냥 정지 충전약 잔량"
                      className="w-24 rounded-md border border-zinc-300 bg-white px-2 py-1 text-right tabular-nums disabled:cursor-not-allowed disabled:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950"
                    />
                    이하
                  </span>
                </div>
                <p className="pl-6 text-[11px] text-zinc-500 dark:text-zinc-400">
                  HP/MP 충전약 중 사용하는 종류 하나라도 기준 이하이면 정지합니다.
                </p>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoStopConfig.rareMapEnabled}
                  onChange={(e) =>
                    updateAutoStopConfig({ rareMapEnabled: e.target.checked })
                  }
                  className="size-4 accent-emerald-600"
                />
                <span>희귀 탐사맵 발견 시</span>
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoStopConfig.level100Enabled}
                  onChange={(e) =>
                    updateAutoStopConfig({ level100Enabled: e.target.checked })
                  }
                  className="size-4 accent-emerald-600"
                />
                <span>레벨 {AUTO_HUNT_LEVEL_TARGET} 도달 시</span>
              </label>
            </div>
          </div>
        )}
        {/* 코어루프 — 사냥 버튼=탭 열림 연속 사냥. 오프라인 사냥=탭 닫아도 최대 2시간 누적 후 정산 */}
        {coreLoopOn && (
          <div className="mt-3 space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
            {offlineHunt?.active ? (
              <button
                type="button"
                onClick={stopOffline}
                disabled={offlineBusy}
                className="ui-game-button w-full rounded-md border border-amber-500 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
              >
                {offlineBusy
                  ? "정지 중…"
                  : `오프라인 사냥 정지 (남은 ${fmtOfflineRemain(offlineHunt.endsAt - now)})`}
              </button>
            ) : (
              <button
                type="button"
                onClick={startOffline}
                disabled={offlineBusy}
                className="ui-game-button w-full rounded-md border border-indigo-500 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-800 transition hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-200"
              >
                {offlineBusy ? "시작 중…" : "오프라인 사냥"}
              </button>
            )}
            <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              사냥 버튼을 누르면 탭이 열려 있는 동안 자동으로 사냥이 계속됩니다(다시
              누르면 멈춤). 오프라인 사냥은 탭을 닫아도 최대 2시간까지 쌓여, 돌아왔을 때
              정산됩니다.
            </p>
            {offlineMsg && (
              <p className="rounded-md bg-emerald-50 px-2 py-1.5 text-[11px] text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                {offlineMsg}
              </p>
            )}
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
              className="ui-game-button mt-2.5 w-full rounded-md border border-rose-600 bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700"
            >
              치료소로 가기
            </button>
          )}
        </div>
      )}

      {/* batch summary 가 우선 노출. 1회 사냥 결과(HuntResultCard) 는 summary 없을 때만. */}
      {/* 캐릭터 정보(HP/MP/EXP)는 위 PlayerStatusCard 로 상시 노출 — 결과는 요약/리플레이만. */}
      {batchSummary ? (
        <BatchSummaryCard
          summary={batchSummary}
          remainingStamina={
            !coreLoopOn && !autoHunt ? staminaCurrent : undefined
          }
          potionThreshold={autoStopConfig.potionThreshold}
          onSelectReplay={setSelectedBatchReplay}
          onEnterRareMap={onEnterRareMap}
        />
      ) : (
        lastResult && (
          <HuntResultCard
            result={lastResult}
            hpCharges={lastResult.hpCharges}
            mpCharges={lastResult.mpCharges}
            hasMp={(mp?.maxMp ?? 0) > 0}
            onEnterRareMap={onEnterRareMap}
          />
        )
      )}

      {batchSummary && selectedBatchReplay?.replay && (
        <ReplayBattleScene
          key={selectedBatchReplay.index}
          payload={selectedBatchReplay.replay}
          startPlayerHp={selectedBatchReplay.startPlayerHp}
          playerName={playerName}
          gender={playerGender}
          exp={selectedBatchReplay.expForBar ?? 0}
          maxExp={selectedBatchReplay.maxExpForBar ?? 1}
          hpCharges={selectedBatchReplay.hpCharges}
          mpCharges={selectedBatchReplay.mpCharges}
          playerSubtitle={playerSubtitle}
          outcome={selectedBatchReplay.won ? undefined : "lose"}
          playerCombat={
            playerCombat
              ? playerCombatToBattleStats(playerCombat, {
                  primaryAttack: playerPrimaryAttack,
                })
              : undefined
          }
        />
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
          // 승리는 결과 카드의 "전투 결과 승리"와 중복이라 배너 생략 — 패배만 부각(코덱스 권고).
          outcome={lastResult.won ? undefined : "lose"}
          playerCombat={
            playerCombat
              ? playerCombatToBattleStats(playerCombat, {
                  primaryAttack: playerPrimaryAttack,
                })
              : undefined
          }
        />
      )}
    </main>
  );
}
