export const FISHING_ANTI_MACRO_KEY = "fishing-anti-macro.v1";

export const FISHING_ANTI_MACRO_RECENT_LIMIT = 40;
export const FISHING_ANTI_MACRO_FLAG_THRESHOLD = 12;
export const FISHING_ANTI_MACRO_HIGH_THRESHOLD = 20;
export const FISHING_ANTI_MACRO_FRICTION_MS = 30_000;
export const FISHING_ANTI_MACRO_HIGH_FRICTION_MS = 90_000;
export const FISHING_ANTI_MACRO_UNIFORM_CLIENT_STDDEV_MS = 25;
export const FISHING_ANTI_MACRO_PREFIRE_MIN_EARLY_MS = 300;
export const FISHING_ANTI_MACRO_PREFIRE_COUNT = 5;
export const FISHING_ANTI_MACRO_IMPOSSIBLE_REACTION_MS = 60;
export const FISHING_ANTI_MACRO_FAST_REACTION_WINDOW = 20;
export const FISHING_ANTI_MACRO_FAST_REACTION_COUNT = 3;

export type FishingAntiMacroReason =
  | "ok"
  | "expired"
  | "too_early"
  | "missed_window";

export type FishingAntiMacroSample = {
  at: number;
  caught: boolean;
  reason: FishingAntiMacroReason;
  clientReactionMs: number;
  serverReactionMs: number;
  earlyByMs: number;
};

export type FishingAntiMacroState = {
  version: 1;
  suspicion: number;
  frictionUntil: number | null;
  recent: FishingAntiMacroSample[];
};

export type FishingAntiMacroRecordResult = {
  state: FishingAntiMacroState;
  flagged: boolean;
  signals: string[];
  frictionMs: number;
};

export function emptyFishingAntiMacroState(): FishingAntiMacroState {
  return { version: 1, suspicion: 0, frictionUntil: null, recent: [] };
}

function nonNegativeMs(raw: unknown): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function sampleOf(raw: unknown): FishingAntiMacroSample | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const reason =
    r.reason === "ok" ||
    r.reason === "expired" ||
    r.reason === "too_early" ||
    r.reason === "missed_window"
      ? r.reason
      : null;
  if (!reason) return null;
  const at = nonNegativeMs(r.at);
  if (at <= 0) return null;
  if (
    typeof r.clientReactionMs !== "number" ||
    typeof r.serverReactionMs !== "number"
  ) {
    return null;
  }
  return {
    at,
    caught: r.caught === true,
    reason,
    clientReactionMs: nonNegativeMs(r.clientReactionMs),
    serverReactionMs: nonNegativeMs(r.serverReactionMs),
    earlyByMs: nonNegativeMs(r.earlyByMs),
  };
}

export function parseFishingAntiMacroState(
  raw: unknown,
): FishingAntiMacroState {
  if (!raw || typeof raw !== "object") return emptyFishingAntiMacroState();
  const r = raw as Record<string, unknown>;
  const suspicion = Math.max(0, Math.min(30, Number(r.suspicion) || 0));
  const frictionUntil =
    typeof r.frictionUntil === "number" && Number.isFinite(r.frictionUntil)
      ? Math.max(0, Math.floor(r.frictionUntil))
      : null;
  const recent = Array.isArray(r.recent)
    ? r.recent
        .map(sampleOf)
        .filter((sample): sample is FishingAntiMacroSample => Boolean(sample))
        .slice(-FISHING_ANTI_MACRO_RECENT_LIMIT)
    : [];
  return { version: 1, suspicion, frictionUntil, recent };
}

export function fishingAntiMacroFriction(
  state: FishingAntiMacroState,
  now: number,
): { active: boolean; retryAfterSec: number } {
  const until = state.frictionUntil ?? 0;
  if (until <= now) return { active: false, retryAfterSec: 0 };
  return {
    active: true,
    retryAfterSec: Math.max(1, Math.ceil((until - now) / 1000)),
  };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length < 2) return Number.POSITIVE_INFINITY;
  const avg = average(values);
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length,
  );
}

function suspiciousSignals(recent: FishingAntiMacroSample[]): string[] {
  const signals: string[] = [];
  const checked = recent.slice(-30);
  const latest = checked.at(-1);
  const caught = checked.filter((sample) => sample.caught);
  if (checked.length >= 24 && caught.length / checked.length >= 0.98) {
    signals.push("near_perfect_success_rate");
  }
  if (caught.length >= 12) {
    const clientStddev = stddev(caught.map((sample) => sample.clientReactionMs));
    const serverStddev = stddev(caught.map((sample) => sample.serverReactionMs));
    const veryFastServerRatio =
      caught.filter((sample) => sample.serverReactionMs <= 120).length /
      caught.length;
    if (clientStddev <= FISHING_ANTI_MACRO_UNIFORM_CLIENT_STDDEV_MS) {
      signals.push("uniform_client_reaction");
    }
    if (serverStddev <= 35) signals.push("uniform_server_reaction");
    if (veryFastServerRatio >= 0.75) signals.push("impossibly_fast_server_reel");
  }
  const recentTooEarly = checked.filter(
    (sample) =>
      sample.reason === "too_early" &&
      sample.earlyByMs >= FISHING_ANTI_MACRO_PREFIRE_MIN_EARLY_MS,
  ).length;
  if (
    recentTooEarly >= FISHING_ANTI_MACRO_PREFIRE_COUNT &&
    latest?.reason === "too_early" &&
    latest.earlyByMs >= FISHING_ANTI_MACRO_PREFIRE_MIN_EARLY_MS
  ) {
    signals.push("repeated_prefire");
  }
  const veryFastPostBite =
    latest?.reason === "too_early" &&
    latest.earlyByMs === 0 &&
    latest.serverReactionMs < FISHING_ANTI_MACRO_IMPOSSIBLE_REACTION_MS;
  if (veryFastPostBite) {
    // 입질 예고를 보고 준비한 손입력도 한 번쯤 60ms 미만으로 도착할 수 있다.
    // 단발은 관찰만 하고, 최근 20회에서 세 번째부터 강신호로 승격한다.
    signals.push("very_fast_post_bite_reel");
    const recentVeryFastPostBite = recent
      .slice(-FISHING_ANTI_MACRO_FAST_REACTION_WINDOW)
      .filter(
        (sample) =>
          sample.reason === "too_early" &&
          sample.earlyByMs === 0 &&
          sample.serverReactionMs < FISHING_ANTI_MACRO_IMPOSSIBLE_REACTION_MS,
      ).length;
    if (recentVeryFastPostBite >= FISHING_ANTI_MACRO_FAST_REACTION_COUNT) {
      signals.push("impossibly_fast_post_bite_reel");
    }
  }
  return signals;
}

// 실제 대기 페널티는 서버 시계로 확인되는 강한 신호에만 부여한다.
// 성공률과 반응 편차는 정상 숙련자도 만들 수 있으므로 관찰 로그에는 남기되 점수에는 넣지 않는다.
function enforcementSignalScore(signals: string[]): number {
  return signals.reduce((score, signal) => {
    if (signal === "impossibly_fast_post_bite_reel") return score + 6;
    if (signal === "repeated_prefire") return score + 4;
    return score;
  }, 0);
}

// 성공한 60~120ms 반응과 단발성 60ms 미만 반응은 입질 예고를 보고 준비한
// 손입력에서도 관측될 수 있다. 반복된 60ms 미만 입력과 반복 선입력만 강신호다.
export function isFishingAntiMacroStrongSignal(signal: string): boolean {
  return (
    signal === "impossibly_fast_post_bite_reel" ||
    signal === "repeated_prefire"
  );
}

export function recordFishingAntiMacroSample(
  state: FishingAntiMacroState,
  sample: FishingAntiMacroSample,
  now: number,
): FishingAntiMacroRecordResult {
  const recent = [...state.recent, sample].slice(-FISHING_ANTI_MACRO_RECENT_LIMIT);
  const signals = suspiciousSignals(recent);
  const score = enforcementSignalScore(signals);
  const suspicion = Math.max(0, Math.min(30, state.suspicion * 0.85 + score));
  // 새 강신호가 없는 정상 표본은 의심 점수만 감쇠시킨다. 감쇠 중 점수가 아직
  // 임계값 위라는 이유로 대기 시간을 갱신하거나 운영 이벤트를 재발시키지 않는다.
  const frictionMs =
    score <= 0
      ? 0
      : suspicion >= FISHING_ANTI_MACRO_HIGH_THRESHOLD
        ? FISHING_ANTI_MACRO_HIGH_FRICTION_MS
        : suspicion >= FISHING_ANTI_MACRO_FLAG_THRESHOLD
          ? FISHING_ANTI_MACRO_FRICTION_MS
          : 0;
  const previousFrictionActive =
    state.frictionUntil !== null && state.frictionUntil > now;
  const frictionUntil = frictionMs > 0 ? now + frictionMs : state.frictionUntil;
  return {
    state: { version: 1, suspicion, frictionUntil, recent },
    flagged: score > 0 && frictionMs > 0 && !previousFrictionActive,
    signals,
    frictionMs,
  };
}
