// v2 1:1 아레나 — 서버 측 코어 로직 (PR-8a).
//
// docs/v2-arena-design.md 의 9.1 확정안 그대로 구현:
//   - 매칭: 본인 제외 전 v2 유저 snapshot + 가중 랜덤
//   - 일일 횟수 제한 폐지 → 매치 간 재도전 쿨타임 10초 (2026-06-08)
//   - 점수: Elo 레이팅(K=32), 0 미만 X
//   - 무승부: 점수 0 / 골드 패배 수준 / 카운터 차감 / recentOpponents 기록
//   - 풀: 전 v2 유저 자동 (opt-in 없음)
//
// 라이브 PvP 코드 직접 이식 X — 신규 모듈. resolveBattlePvP 엔진만 재사용.

import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";
import type { ArenaSeasonPhase } from "@/lib/server/pvp/arenaTournament";

// ─── 상수 (튜닝 다이얼) ─────────────────────────────────────────────────────

// 매치 재도전 쿨타임(ms). 일일 횟수 제한 대신 이 쿨타임으로 페이스 조절(2026-06-08).
// 서버 권위(lastMatchAt 체크) + 클라 버튼 카운트다운 양쪽에서 사용.
export const ARENA_MATCH_COOLDOWN_MS = 10_000;
// 아레나 한정 최종 피해 배율. 다른 resolveBattlePvP 호출부(전초기지 등)는 기본값 1을 유지한다.
export const ARENA_DAMAGE_MULTIPLIER = 0.65;
// 아레나 한정 회복·보호막 생성 배율. 무자원 1회 회복기의 별도 PvP 제한과는 중복 적용하지 않는다.
export const ARENA_SUSTAIN_MULTIPLIER = 0.65;
export const ARENA_STAMINA_MATCHES_PER_STEP = 10;
export const RECENT_OPPONENT_TRACK = 5;
// 전투 기록 — 최근 N판의 요약과 별도 저장된 replayId를 보존한다.
export const ARENA_HISTORY_MAX = 50;

// Elo 레이팅. 옛 누적 점수와 의미가 달라서 ratingVersion 으로 구분한다.
export const ARENA_INITIAL_RATING = 1000;
export const ARENA_ELO_K = 32;
export const ARENA_RATING_VERSION = 2;

// 골드 공식 (본인 레벨 ×)
export const GOLD_WIN_PER_LEVEL = 50;
export const GOLD_LOSS_PER_LEVEL = 10;
export const GOLD_DRAW_PER_LEVEL = GOLD_LOSS_PER_LEVEL;

// 매칭 후보군 — 가까운 점수대부터 찾고, 풀 자체를 제한해 먼 후보 다수가
// 합산 가중치로 가까운 후보를 밀어내지 못하게 한다.
export const ARENA_MATCH_SCORE_WINDOWS = [50, 100, 200] as const;
export const ARENA_MATCH_POOL_TARGET = 5;
export const ARENA_MATCH_POOL_MAX = 12;

// 매칭 가중치 곡선. 점수 차 50마다 선택 가중치가 절반으로 감소한다.
export const SCORE_WEIGHT_AT_ZERO = 1.0;
export const SCORE_WEIGHT_FLOOR = 0.02;
export const SCORE_WEIGHT_HALF_LIFE = 50;
export const LEVEL_WEIGHT_AT_ZERO = 1.0;
export const LEVEL_WEIGHT_FLOOR = 0.3;
export const LEVEL_WEIGHT_SPAN = 20; // 레벨 차 ±20 = 0.3
export const RECENT_OPPONENT_PENALTY = 0.2; // 최근 5매치 상대 가중치 ×

// ─── 타입 ──────────────────────────────────────────────────────────────────

export type ArenaMatchOutcome = "win" | "loss" | "draw";

export type ArenaOpponentRef = {
  userId?: string;
  botId?: string;
  /** ISO 시각 — 최근 N매치 추적용. */
  at: string;
};

export type ArenaState = {
  score: number;
  /** score 해석 버전. v2부터 Elo rating 이며, 옛 누적 점수는 기본 Elo 점수로 리셋한다. */
  ratingVersion: number;
  /** 마지막 매치 시각(ISO). 이 시각 + ARENA_MATCH_COOLDOWN_MS 전까지 재도전 불가. */
  lastMatchAt: string;
  /** KST 기준 일일 매치 횟수를 기록한 날짜(YYYY-MM-DD). */
  dailyMatchDate: string;
  /** dailyMatchDate 당 실제로 성립한 공격 매치 수. */
  dailyMatchCount: number;
  recentOpponents: ArenaOpponentRef[];
  /** PR-8b 에서 활용. PR-8a 는 빈 배열로 두기만 함. */
  milestonesReached: number[];
};

export type ArenaCandidate = {
  /** 실유저면 userId, 봇이면 botId. */
  userId?: string;
  botId?: string;
  name: string;
  level: number;
  score: number;
};

// 전투 기록 한 판 — 결과 요약 + 리플레이(다시보기용). arena-history.v2 에 최근순 ≤ MAX 저장.
export type ArenaHistoryEntry = {
  /** 고유 키(UI list key·다시보기 선택). at + 짧은 난수. */
  id: string;
  /** ISO 시각. */
  at: string;
  /** 이 기록의 사용자 관점 — 내가 도전했으면 attacker, 상대가 나를 공격했으면 defender. */
  role: "attacker" | "defender";
  outcome: ArenaMatchOutcome;
  opponent: { name: string; level: number; userId?: string; botId?: string };
  scoreBefore: number;
  scoreAfter: number;
  scoreDelta: number;
  goldGained: number;
  turns: number;
  /** 전투 로그 다시보기 — ReplayBattleScene 페이로드(나=player 관점). */
  replay: ReplayPayload;
};

// 방어적 파싱 — 배열 + 필수 필드(outcome·opponent·replay.log) 있는 엔트리만, 최근순 ≤ MAX.
export function parseArenaHistory(value: unknown): ArenaHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const out: ArenaHistoryEntry[] = [];
  for (const e of value) {
    if (!e || typeof e !== "object") continue;
    const o = e as Record<string, unknown>;
    if (o.outcome !== "win" && o.outcome !== "loss" && o.outcome !== "draw") {
      continue;
    }
    if (!o.opponent || typeof o.opponent !== "object") continue;
    const replay = o.replay as { log?: unknown } | null;
    if (
      !replay ||
      typeof replay !== "object" ||
      !Array.isArray(replay.log) ||
      (replay.log.length === 0 &&
        typeof (replay as { replayId?: unknown }).replayId !== "string")
    ) {
      continue;
    }
    // role 도입 전 기록 호환: 공격자는 결과와 무관하게 골드 보상을 받았고 방어자는 0이었다.
    // 새 기록은 항상 role 을 명시하므로 이 추론은 구형 저장 데이터에만 적용된다.
    const role =
      o.role === "attacker" || o.role === "defender"
        ? o.role
        : typeof o.goldGained === "number" && o.goldGained > 0
          ? "attacker"
          : "defender";
    out.push({ ...(e as ArenaHistoryEntry), role });
    if (out.length >= ARENA_HISTORY_MAX) break;
  }
  return out;
}

// 새 기록을 맨 앞에 끼우고 최근순 ≤ MAX 로 자른다.
export function pushArenaHistory(
  list: ArenaHistoryEntry[],
  entry: ArenaHistoryEntry,
): ArenaHistoryEntry[] {
  return [entry, ...list].slice(0, ARENA_HISTORY_MAX);
}

// 일반 아레나 다시보기는 주간 시즌이 바뀌면 초기화한다. 승/패/무와 최종 점수는
// pvp_ratings 시즌 요약에 남으므로 리플레이가 사라져도 누적 전적은 유지된다.
export function arenaHistorySince(
  list: ArenaHistoryEntry[],
  seasonStartsAt: Date,
): ArenaHistoryEntry[] {
  const cutoff = seasonStartsAt.getTime();
  return list.filter((entry) => {
    const at = new Date(entry.at).getTime();
    return Number.isFinite(at) && at >= cutoff;
  });
}

// ─── State 파싱·기본값 ──────────────────────────────────────────────────────

export function defaultArenaState(): ArenaState {
  return {
    score: ARENA_INITIAL_RATING,
    ratingVersion: ARENA_RATING_VERSION,
    lastMatchAt: new Date(0).toISOString(), // 에폭 = 쿨타임 없음(즉시 도전 가능).
    dailyMatchDate: "",
    dailyMatchCount: 0,
    recentOpponents: [],
    milestonesReached: [],
  };
}

/**
 * savesKv.value (JSON) 를 ArenaState 로 정규화.
 *
 * 미존재·형식 오류·옛 버전 모두 안전하게 default 로 떨어진다. value 가 객체이면
 * 알려진 필드만 추려서 박는다. 모르는 필드는 무시 — append-only 진화 위해.
 */
export function parseArenaState(value: unknown): ArenaState {
  const def = defaultArenaState();
  if (!value || typeof value !== "object") return def;
  const v = value as Record<string, unknown>;
  const ratingVersion =
    typeof v.ratingVersion === "number" && Number.isFinite(v.ratingVersion)
      ? Math.floor(v.ratingVersion)
      : 1;
  const score =
    ratingVersion === ARENA_RATING_VERSION &&
    typeof v.score === "number" &&
    Number.isFinite(v.score)
      ? Math.max(0, Math.floor(v.score))
      : def.score;
  const lastMatchAt =
    typeof v.lastMatchAt === "string" && v.lastMatchAt.length > 0
      ? v.lastMatchAt
      : def.lastMatchAt;
  const dailyMatchDate =
    typeof v.dailyMatchDate === "string" ? v.dailyMatchDate : "";
  const dailyMatchCount =
    typeof v.dailyMatchCount === "number" && Number.isFinite(v.dailyMatchCount)
      ? Math.max(0, Math.floor(v.dailyMatchCount))
      : 0;
  const recentOpponents: ArenaOpponentRef[] = Array.isArray(v.recentOpponents)
    ? v.recentOpponents
        .filter((o): o is Record<string, unknown> => !!o && typeof o === "object")
        .map(
          (o): ArenaOpponentRef => ({
            userId: typeof o.userId === "string" ? o.userId : undefined,
            botId: typeof o.botId === "string" ? o.botId : undefined,
            at: typeof o.at === "string" ? o.at : new Date(0).toISOString(),
          }),
        )
        .filter((o) => !!o.userId || !!o.botId)
        .slice(-RECENT_OPPONENT_TRACK)
    : def.recentOpponents;
  const milestonesReached = Array.isArray(v.milestonesReached)
    ? v.milestonesReached.filter(
        (n): n is number => typeof n === "number" && Number.isFinite(n),
      )
    : def.milestonesReached;
  return {
    score,
    ratingVersion: ARENA_RATING_VERSION,
    lastMatchAt,
    dailyMatchDate,
    dailyMatchCount,
    recentOpponents,
    milestonesReached,
  };
}

// ─── 일일 스태미나 비용 ───────────────────────────────────────────────────

export function arenaKstDateKey(now: Date | number = Date.now()): string {
  const time = now instanceof Date ? now.getTime() : now;
  return new Date(time + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function arenaDailyMatchCount(
  state: ArenaState,
  now: Date | number = Date.now(),
): number {
  return state.dailyMatchDate === arenaKstDateKey(now)
    ? state.dailyMatchCount
    : 0;
}

/** 1~10회는 1, 11~20회는 2처럼 10회마다 다음 매치 비용이 1씩 오른다. */
export function arenaNextStaminaCost(
  state: ArenaState,
  now: Date | number = Date.now(),
): number {
  return (
    Math.floor(arenaDailyMatchCount(state, now) / ARENA_STAMINA_MATCHES_PER_STEP) +
    1
  );
}

/** 일요일 토너먼트 단계는 무보상 연습전이므로 무료로 제공한다. */
export function arenaStaminaCostForPhase(
  state: ArenaState,
  phase: ArenaSeasonPhase,
  now: Date | number = Date.now(),
): number {
  return phase === "tournament" ? 0 : arenaNextStaminaCost(state, now);
}

export function recordArenaDailyMatch(
  state: ArenaState,
  now: Date | number = Date.now(),
): ArenaState {
  return {
    ...state,
    dailyMatchDate: arenaKstDateKey(now),
    dailyMatchCount: arenaDailyMatchCount(state, now) + 1,
  };
}

// ─── 재도전 쿨타임 ─────────────────────────────────────────────────────────

/**
 * 마지막 매치 이후 남은 쿨타임(ms). 0 이면 즉시 재도전 가능.
 * lastMatchAt 파싱 불능이면 0(쿨타임 없음)으로 본다.
 */
export function arenaCooldownRemainingMs(state: ArenaState, now: Date): number {
  const last = new Date(state.lastMatchAt).getTime();
  if (!Number.isFinite(last)) return 0;
  return Math.max(0, ARENA_MATCH_COOLDOWN_MS - (now.getTime() - last));
}

// ─── 점수·골드 ─────────────────────────────────────────────────────────────

/**
 * 경기 결과 → Elo 점수 변동. 0 미만은 0 으로 클램프 (호출 측에서).
 */
export function computeScoreDelta(
  myScore: number,
  oppScore: number,
  outcome: ArenaMatchOutcome,
): number {
  const actual = outcome === "win" ? 1 : outcome === "draw" ? 0.5 : 0;
  const expected = 1 / (1 + 10 ** ((oppScore - myScore) / 400));
  return Math.round(ARENA_ELO_K * (actual - expected));
}

export function oppositeArenaOutcome(
  outcome: ArenaMatchOutcome,
): ArenaMatchOutcome {
  if (outcome === "win") return "loss";
  if (outcome === "loss") return "win";
  return "draw";
}

export function settleArenaElo(
  attackerScore: number,
  defenderScore: number,
  attackerOutcome: ArenaMatchOutcome,
) {
  const attackerDelta = computeScoreDelta(
    attackerScore,
    defenderScore,
    attackerOutcome,
  );
  const defenderDelta = -attackerDelta;
  return {
    attackerScoreBefore: attackerScore,
    attackerScoreAfter: applyScoreDelta(attackerScore, attackerDelta),
    attackerDelta,
    defenderScoreBefore: defenderScore,
    defenderScoreAfter: applyScoreDelta(defenderScore, defenderDelta),
    defenderDelta,
  };
}

export function computeGoldReward(
  level: number,
  outcome: ArenaMatchOutcome,
): number {
  const lv = Math.max(1, level);
  if (outcome === "win") return lv * GOLD_WIN_PER_LEVEL;
  if (outcome === "draw") return lv * GOLD_DRAW_PER_LEVEL;
  return lv * GOLD_LOSS_PER_LEVEL;
}

/**
 * 본인 점수에 delta 를 적용하고 0 미만은 0 으로 클램프.
 */
export function applyScoreDelta(score: number, delta: number): number {
  return Math.max(0, score + delta);
}

// ─── 매칭 가중치 ───────────────────────────────────────────────────────────

function linearWeight(
  diff: number,
  span: number,
  atZero: number,
  floor: number,
): number {
  const absDiff = Math.abs(diff);
  if (absDiff >= span) return floor;
  const ratio = absDiff / span;
  return atZero - (atZero - floor) * ratio;
}

/**
 * 점수상 가장 가까운 후보군을 만든다.
 *
 * ±50 → ±100 → ±200 순서로 넓히며 목표 인원에 처음 도달한 구간을 사용한다.
 * 구간 안 후보가 너무 많으면 가까운 순서로 상한을 두고, ±200 안에도 목표 인원이
 * 없으면 전체에서 가장 가까운 후보만 보충한다. 고정 50점 버킷의 경계 단절 없이
 * 작은 시즌 풀에서도 항상 상대를 찾을 수 있다.
 */
export function selectArenaCandidatePool<T extends ArenaCandidate>(
  myScore: number,
  candidates: ReadonlyArray<T>,
  options: { target?: number; max?: number; rng?: () => number } = {},
): T[] {
  const target = Math.max(
    1,
    Math.floor(options.target ?? ARENA_MATCH_POOL_TARGET),
  );
  const max = Math.max(
    target,
    Math.floor(options.max ?? ARENA_MATCH_POOL_MAX),
  );
  const rng = options.rng ?? Math.random;
  const sorted = candidates
    .map((candidate) => ({ candidate, tieBreaker: rng() }))
    .sort((a, b) => {
      const scoreGap =
        Math.abs(a.candidate.score - myScore) -
        Math.abs(b.candidate.score - myScore);
      if (scoreGap !== 0) return scoreGap;
      return a.tieBreaker - b.tieBreaker;
    })
    .map(({ candidate }) => candidate);

  for (const window of ARENA_MATCH_SCORE_WINDOWS) {
    const inWindow = sorted.filter(
      (candidate) => Math.abs(candidate.score - myScore) <= window,
    );
    if (inWindow.length >= target) return inWindow.slice(0, max);
  }

  return sorted.slice(0, Math.min(target, sorted.length));
}

/** 현재 시즌 참가자를 우선하고 목표 인원이 부족할 때만 미참가자로 보충한다. */
export function selectPreferredArenaCandidatePool<T extends ArenaCandidate>(
  myScore: number,
  preferred: ReadonlyArray<T>,
  fallback: ReadonlyArray<T>,
  options: { target?: number; max?: number; rng?: () => number } = {},
): T[] {
  const target = Math.max(
    1,
    Math.floor(options.target ?? ARENA_MATCH_POOL_TARGET),
  );
  const preferredPool = selectArenaCandidatePool(myScore, preferred, {
    ...options,
    target,
  });
  const missing = Math.max(0, target - preferredPool.length);
  if (missing === 0) return preferredPool;
  return [
    ...preferredPool,
    ...selectArenaCandidatePool(myScore, fallback, {
      target: missing,
      max: missing,
      rng: options.rng,
    }),
  ];
}

/**
 * 한 후보에 대한 가중치. recentOpponents 의 userId/botId 와 일치하면
 * RECENT_OPPONENT_PENALTY 곱셈 페널티. 0 이하는 0.0001 로 클램프(가중 랜덤이
 * 모두 0 이면 추첨 실패하므로 트레이스 가능한 최소값).
 */
export function weightForCandidate(
  myScore: number,
  myLevel: number,
  candidate: ArenaCandidate,
  recent: ReadonlyArray<ArenaOpponentRef>,
): number {
  const scoreW = Math.max(
    SCORE_WEIGHT_FLOOR,
    SCORE_WEIGHT_AT_ZERO *
      Math.pow(
        0.5,
        Math.abs(candidate.score - myScore) / SCORE_WEIGHT_HALF_LIFE,
      ),
  );
  const levelW = linearWeight(
    candidate.level - myLevel,
    LEVEL_WEIGHT_SPAN,
    LEVEL_WEIGHT_AT_ZERO,
    LEVEL_WEIGHT_FLOOR,
  );
  let w = scoreW * levelW;
  const isRecent = recent.some(
    (r) =>
      (candidate.userId && r.userId === candidate.userId) ||
      (candidate.botId && r.botId === candidate.botId),
  );
  if (isRecent) w *= RECENT_OPPONENT_PENALTY;
  return Math.max(0.0001, w);
}

/**
 * 가중 랜덤 추첨. weights 합 0 이거나 candidates 빈 배열이면 null.
 *
 * rng 는 0 ≤ x < 1 을 반환. 테스트에서 결정적 rng 주입 가능.
 */
export function weightedPick<T>(
  items: ReadonlyArray<{ item: T; weight: number }>,
  rng: () => number,
): T | null {
  if (items.length === 0) return null;
  const total = items.reduce((s, x) => s + Math.max(0, x.weight), 0);
  if (total <= 0) return null;
  let r = rng() * total;
  for (const x of items) {
    r -= Math.max(0, x.weight);
    if (r <= 0) return x.item;
  }
  return items[items.length - 1].item;
}

// ─── recentOpponents 갱신 ─────────────────────────────────────────────────

export function pushRecentOpponent(
  recent: ReadonlyArray<ArenaOpponentRef>,
  ref: ArenaOpponentRef,
): ArenaOpponentRef[] {
  const next = [...recent, ref];
  if (next.length > RECENT_OPPONENT_TRACK) {
    return next.slice(next.length - RECENT_OPPONENT_TRACK);
  }
  return next;
}
