// v2 1:1 아레나 — 서버 측 코어 로직 (PR-8a).
//
// docs/v2-arena-design.md 의 9.1 확정안 그대로 구현:
//   - 매칭: 본인 제외 전 v2 유저 snapshot + 가중 랜덤 + 봇 폴백
//   - 일일 10회 (자정 KST 리셋)
//   - 점수 자연 발산 (천장 X), 0 미만 X
//   - 무승부: 점수 0 / 골드 패배 수준 / 카운터 차감 / recentOpponents 기록
//   - 풀: 전 v2 유저 자동 (opt-in 없음)
//
// 라이브 PvP 코드 직접 이식 X — 신규 모듈. resolveBattlePvP 엔진만 재사용.

// ─── 상수 (튜닝 다이얼) ─────────────────────────────────────────────────────

export const MAX_DAILY_MATCHES = 10;
export const RECENT_OPPONENT_TRACK = 5;

// 점수 공식
export const SCORE_WIN = 20;
export const SCORE_LOSS = -10;
export const SCORE_DRAW = 0;
export const SCORE_UPSET_BONUS = 5; // 본인보다 점수 높은 상대 승리 시 +
export const SCORE_UPSET_PENALTY = -5; // 본인보다 점수 낮은 상대 패배 시 -

// 골드 공식 (본인 레벨 ×)
export const GOLD_WIN_PER_LEVEL = 50;
export const GOLD_LOSS_PER_LEVEL = 10;
export const GOLD_DRAW_PER_LEVEL = GOLD_LOSS_PER_LEVEL;

// 매칭 가중치 곡선
export const SCORE_WEIGHT_AT_ZERO = 1.0;
export const SCORE_WEIGHT_FLOOR = 0.3;
export const SCORE_WEIGHT_SPAN = 200; // 점수 차 ±200 = 0.3
export const LEVEL_WEIGHT_AT_ZERO = 1.0;
export const LEVEL_WEIGHT_FLOOR = 0.3;
export const LEVEL_WEIGHT_SPAN = 20; // 레벨 차 ±20 = 0.3
export const RECENT_OPPONENT_PENALTY = 0.2; // 최근 5매치 상대 가중치 ×

// 봇 폴백 — 본인 레벨 ±BOT_LEVEL_BAND 안 프리셋
export const BOT_LEVEL_BAND = 5;

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
  dailyUsed: number;
  /** 다음 자정 KST. 이 시각이 지나면 dailyUsed 0 으로 리셋. */
  dailyResetAt: string;
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

// ─── State 파싱·기본값 ──────────────────────────────────────────────────────

export function defaultArenaState(now: Date): ArenaState {
  return {
    score: 0,
    dailyUsed: 0,
    dailyResetAt: nextKstMidnight(now).toISOString(),
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
export function parseArenaState(value: unknown, now: Date): ArenaState {
  const def = defaultArenaState(now);
  if (!value || typeof value !== "object") return def;
  const v = value as Record<string, unknown>;
  const score =
    typeof v.score === "number" && Number.isFinite(v.score)
      ? Math.max(0, Math.floor(v.score))
      : def.score;
  const dailyUsed =
    typeof v.dailyUsed === "number" && Number.isFinite(v.dailyUsed)
      ? Math.max(0, Math.floor(v.dailyUsed))
      : def.dailyUsed;
  const dailyResetAt =
    typeof v.dailyResetAt === "string" && v.dailyResetAt.length > 0
      ? v.dailyResetAt
      : def.dailyResetAt;
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
  return { score, dailyUsed, dailyResetAt, recentOpponents, milestonesReached };
}

// ─── 일일 리셋 ─────────────────────────────────────────────────────────────

/**
 * KST 자정 = UTC 의 전날 15:00. now 기준 다음 KST 자정을 반환.
 */
export function nextKstMidnight(now: Date): Date {
  const kstMs = now.getTime() + 9 * 60 * 60 * 1000;
  const kst = new Date(kstMs);
  kst.setUTCHours(0, 0, 0, 0);
  kst.setUTCDate(kst.getUTCDate() + 1);
  return new Date(kst.getTime() - 9 * 60 * 60 * 1000);
}

/**
 * dailyResetAt 이 now 보다 과거면 dailyUsed = 0 으로 리셋, dailyResetAt 도 다음
 * 자정으로 갱신. 이미 미래면 noop. wasReset 여부도 반환.
 */
export function applyDailyReset(
  state: ArenaState,
  now: Date,
): { state: ArenaState; wasReset: boolean } {
  const resetAt = new Date(state.dailyResetAt);
  if (!Number.isFinite(resetAt.getTime()) || resetAt.getTime() <= now.getTime()) {
    return {
      state: {
        ...state,
        dailyUsed: 0,
        dailyResetAt: nextKstMidnight(now).toISOString(),
      },
      wasReset: true,
    };
  }
  return { state, wasReset: false };
}

// ─── 점수·골드 ─────────────────────────────────────────────────────────────

/**
 * 경기 결과 → 점수 변동. 0 미만은 0 으로 클램프 (호출 측에서).
 */
export function computeScoreDelta(
  myScore: number,
  oppScore: number,
  outcome: ArenaMatchOutcome,
): number {
  if (outcome === "draw") return SCORE_DRAW;
  if (outcome === "win") {
    return oppScore > myScore ? SCORE_WIN + SCORE_UPSET_BONUS : SCORE_WIN;
  }
  return oppScore < myScore ? SCORE_LOSS + SCORE_UPSET_PENALTY : SCORE_LOSS;
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
 * 본인 점수에 delta 를 적용하고 0 미만은 0 으로 클램프. 점수 0 인 신규 유저가
 * 첫 매치에 패배해도 음수로 떨어지지 않도록 매치 라우트가 사용.
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
  const scoreW = linearWeight(
    candidate.score - myScore,
    SCORE_WEIGHT_SPAN,
    SCORE_WEIGHT_AT_ZERO,
    SCORE_WEIGHT_FLOOR,
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

