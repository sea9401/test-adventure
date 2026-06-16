// v2 ATB(속도 타임라인) 전투 — 순수 스케줄링 헬퍼. (engine.ts 와 분리해 단위테스트 가능)
//
// 고정 교대(나 한 번 너 한 번) → "다음 행동 tick 가장 빠른 액터가 행동"하는 타임라인.
// SPD 는 데미지에 **행동 빈도 하나로만** 기여한다(데미지식·스탯은 불변). 빠른 빌드(도적/궁사)가
// 탱크 대비 ~2배 행동 = 정체성. 단순 1/spd 는 궁사가 49배라 금지 → 로그 소프트캡으로 ~2배 천장.
//
// 🔑 "스탯 과열"의 범인은 ATB 가 아니라 기존 SPD 파생 extraAttackChancePct(=spd×0.5)다. ATB 에선
//    그걸 제거(빈도로 일원화)해야 ~2배로 통제된다 — 그 제거는 엔진 통합 단계에서.
// 이 모듈은 결정론(Math.random 미사용) — 리플레이가 동일 타임라인을 재현한다.

// 속도 매운맛 다이얼 — 빠른 빌드의 최대 행동 배율 상한. 260≈2.0배(추천)·220≈1.6배·320≈2.1배.
export const RATE_CAP = 260;
// 로그 게인 — 클수록 SPD 당 빈도 증가 가파름. Phase0 추천 0.75.
export const SPD_RATE_GAIN = 0.75;
// ln(1 + spd/REF) 기준 스케일 — 50 에서 의미 있는 곡률.
export const RATE_REF_SPD = 50;
// 기준 액터(rate 100)의 행동 간격(tick). interval = ceil(RATE_BASE^2 / rate).
const RATE_BASE = 100;

// 전투 로그 표시 — 이 틱 폭 단위로 행동들을 한 박스에 묶는다(UI). 기준 액터 1행동≈100틱이라
//   200 ≈ 약 2교대(플레이어·적 행동 2~4개 + HP 바 1개)를 한 "순간"으로 보여줘 잘게 쪼개짐을 줄임.
//   순수 표시 다이얼 — 엔진/리플레이 불변, 한 줄로 조절. BattleLogList 가 e.t 를 이 값으로 버킷팅.
export const ATB_LOG_WINDOW_TICKS = 200;

// 행동 레이트 — SPD 가 높을수록 ↑, RATE_CAP 에서 평평. 100 = 기준 속도.
export function actionRate(spd: number): number {
  const s = Math.max(0, Number(spd) || 0);
  return Math.min(
    RATE_CAP,
    RATE_BASE * (1 + SPD_RATE_GAIN * Math.log(1 + s / RATE_REF_SPD)),
  );
}

// 행동 간격(tick) — rate 의 역수 스케일. 작을수록 자주 행동. 정수 tick(결정론).
export function actionInterval(spd: number): number {
  return Math.ceil((RATE_BASE * RATE_BASE) / actionRate(spd));
}

// 몬스터 SPD(원시 1~9, 중앙 6)를 플레이어 스케일(14~292)로 진입 매핑. spd1→16·spd6→46.
//   깊이 보정 가산 — 깊을수록 플레이어가 레벨업으로 빨라져 몬스터가 행동 빈도에서 뒤처지는 것
//   완화(Phase 4). 보정 0 이면 옛 매핑.
export function effectiveMonsterSpd(rawSpd: number, depthCorrection = 0): number {
  const s = Math.max(0, Math.floor(Number(rawSpd) || 0));
  return 10 + s * 6 + Math.max(0, Number(depthCorrection) || 0);
}

// 깊이당 몬스터 effective SPD 가산 — 깊을수록 ↑(약한 보정). depth 1=0(초반 균형 보존), 이후
//   선형, DEPTH_CORR_MAX_DEPTH 에서 평탄(endgame frontier 폭주 차단 — 무한 가산이면 느린/균형
//   빌드가 깊이서 swarm 당해 무너짐을 sim 으로 확인). 다이얼: GAIN↑=페이스 유지↑·깊이 난이도↑.
export const DEPTH_SPD_GAIN = 1.0;
export const DEPTH_CORR_MAX_DEPTH = 12; // 레벨캡 깊이(~Lv50) 근방에서 cap
export function depthSpdCorrection(depth: number): number {
  const d = Math.max(1, Math.floor(Number(depth) || 1));
  const capped = Math.min(d, DEPTH_CORR_MAX_DEPTH);
  return Math.round(DEPTH_SPD_GAIN * (capped - 1));
}

// === 타임라인 큐 (결정론 순서) ===========================================
// 1v1 PvE 는 player/enemy 둘 뿐이지만, 동점 규칙을 명시하고 PvP/멀티로 일반화 가능하게 둔다.
export type TimelineActor = "player" | "enemy";

// 동점(같은 nextTick) 우선순위 — 낮을수록 먼저. PvE 는 player 우선.
export function tieRank(actor: TimelineActor): number {
  return actor === "player" ? 0 : 1;
}

export type TimelineEntry = {
  actor: TimelineActor;
  // 다음 행동 예정 tick(절대값). 행동 후 += actionInterval(현재 SPD).
  nextTick: number;
  // 단조 증가 시퀀스 — nextTick·tieRank 까지 같을 때의 최종 안정 정렬키(>2 액터 대비).
  sequenceNo: number;
};

// 다음 행동 액터 선택 — (nextTick, tieRank, sequenceNo) 사전식 최소. 결정론.
export function pickNextEntry(queue: readonly TimelineEntry[]): TimelineEntry | null {
  let best: TimelineEntry | null = null;
  for (const e of queue) {
    if (best === null) {
      best = e;
      continue;
    }
    if (e.nextTick !== best.nextTick) {
      if (e.nextTick < best.nextTick) best = e;
      continue;
    }
    const er = tieRank(e.actor);
    const br = tieRank(best.actor);
    if (er !== br) {
      if (er < br) best = e;
      continue;
    }
    if (e.sequenceNo < best.sequenceNo) best = e;
  }
  return best;
}

// 1v1 편의 — 두 액터의 nextTick 만으로 다음 액터(동점 player). 엔진 PvE 루프용.
export function nextActor1v1(
  playerNextTick: number,
  enemyNextTick: number,
): TimelineActor {
  if (playerNextTick !== enemyNextTick) {
    return playerNextTick < enemyNextTick ? "player" : "enemy";
  }
  return "player"; // 동점 → player 우선(tieRank)
}
