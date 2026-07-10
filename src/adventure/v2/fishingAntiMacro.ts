export const FISHING_ANTI_MACRO_KEY = "fishing-anti-macro.v1";

export const FISHING_ANTI_MACRO_RECENT_LIMIT = 40;
export const FISHING_ANTI_MACRO_FLAG_THRESHOLD = 12;
export const FISHING_ANTI_MACRO_HIGH_THRESHOLD = 20;
export const FISHING_ANTI_MACRO_FRICTION_MS = 30_000;
export const FISHING_ANTI_MACRO_HIGH_FRICTION_MS = 90_000;

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
    if (clientStddev <= 8) signals.push("uniform_client_reaction");
    if (serverStddev <= 35) signals.push("uniform_server_reaction");
    if (veryFastServerRatio >= 0.75) signals.push("impossibly_fast_server_reel");
  }
  const recentTooEarly = checked.filter(
    (sample) => sample.reason === "too_early" && sample.serverReactionMs <= 80,
  ).length;
  if (recentTooEarly >= 3) signals.push("repeated_prefire");
  return signals;
}

function signalScore(signals: string[]): number {
  return signals.reduce((score, signal) => {
    if (signal === "impossibly_fast_server_reel") return score + 6;
    if (signal === "repeated_prefire") return score + 4;
    if (signal === "uniform_client_reaction") return score + 4;
    if (signal === "uniform_server_reaction") return score + 3;
    if (signal === "near_perfect_success_rate") return score + 1;
    return score;
  }, 0);
}

export function recordFishingAntiMacroSample(
  state: FishingAntiMacroState,
  sample: FishingAntiMacroSample,
  now: number,
): FishingAntiMacroRecordResult {
  const recent = [...state.recent, sample].slice(-FISHING_ANTI_MACRO_RECENT_LIMIT);
  const signals = suspiciousSignals(recent);
  const score = signalScore(signals);
  const suspicion = Math.max(0, Math.min(30, state.suspicion * 0.85 + score));
  const frictionMs =
    suspicion >= FISHING_ANTI_MACRO_HIGH_THRESHOLD
      ? FISHING_ANTI_MACRO_HIGH_FRICTION_MS
      : suspicion >= FISHING_ANTI_MACRO_FLAG_THRESHOLD
        ? FISHING_ANTI_MACRO_FRICTION_MS
        : 0;
  const previousFrictionActive =
    state.frictionUntil !== null && state.frictionUntil > now;
  const frictionUntil = frictionMs > 0 ? now + frictionMs : state.frictionUntil;
  return {
    state: { version: 1, suspicion, frictionUntil, recent },
    flagged: frictionMs > 0 && !previousFrictionActive,
    signals,
    frictionMs,
  };
}
