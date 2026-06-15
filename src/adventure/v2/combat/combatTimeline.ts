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

// 몬스터 SPD(원시 1~14, 중앙 6)를 플레이어 스케일(14~292)로 진입 매핑. spd1→16·spd14→94.
//   깊이 보정은 던전 깊이별 미세 조정용(기본 0) — 엔진 통합 단계에서 주입.
export function effectiveMonsterSpd(rawSpd: number, depthCorrection = 0): number {
  const s = Math.max(0, Math.floor(Number(rawSpd) || 0));
  return 10 + s * 6 + (Number(depthCorrection) || 0);
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
