// v2 1:1 아레나 — 서버 측 코어 로직 (PR-8a).
//
// docs/v2-arena-design.md 의 9.1 확정안 그대로 구현:
//   - 매칭: 본인 제외 전 v2 유저 snapshot + 가중 랜덤
//   - 일일 횟수 제한 폐지 → 매치 간 재도전 쿨타임 10초 (2026-06-08)
//   - 점수 자연 발산 (천장 X), 0 미만 X
//   - 무승부: 점수 0 / 골드 패배 수준 / 카운터 차감 / recentOpponents 기록
//   - 풀: 전 v2 유저 자동 (opt-in 없음)
//
// 라이브 PvP 코드 직접 이식 X — 신규 모듈. resolveBattlePvP 엔진만 재사용.

import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";

// ─── 상수 (튜닝 다이얼) ─────────────────────────────────────────────────────

// 매치 재도전 쿨타임(ms). 일일 횟수 제한 대신 이 쿨타임으로 페이스 조절(2026-06-08).
// 서버 권위(lastMatchAt 체크) + 클라 버튼 카운트다운 양쪽에서 사용.
export const ARENA_MATCH_COOLDOWN_MS = 10_000;
export const RECENT_OPPONENT_TRACK = 5;
// 전투 기록 — 최근 N판을 리플레이 로그까지 저장(다시보기). 세이브 크기 바운드.
export const ARENA_HISTORY_MAX = 10;

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
  /** 마지막 매치 시각(ISO). 이 시각 + ARENA_MATCH_COOLDOWN_MS 전까지 재도전 불가. */
  lastMatchAt: string;
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
  outcome: ArenaMatchOutcome;
  opponent: { name: string; level: number };
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
    if (!replay || typeof replay !== "object" || !Array.isArray(replay.log)) {
      continue;
    }
    out.push(e as ArenaHistoryEntry);
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

// ─── State 파싱·기본값 ──────────────────────────────────────────────────────

export function defaultArenaState(): ArenaState {
  return {
    score: 0,
    lastMatchAt: new Date(0).toISOString(), // 에폭 = 쿨타임 없음(즉시 도전 가능).
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
  const score =
    typeof v.score === "number" && Number.isFinite(v.score)
      ? Math.max(0, Math.floor(v.score))
      : def.score;
  const lastMatchAt =
    typeof v.lastMatchAt === "string" && v.lastMatchAt.length > 0
      ? v.lastMatchAt
      : def.lastMatchAt;
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
  return { score, lastMatchAt, recentOpponents, milestonesReached };
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

