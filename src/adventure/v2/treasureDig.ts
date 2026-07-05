// 발굴 미니게임 — 유물 노출도/보존도/붕괴 위험을 관리하는 발굴 상태 머신.
//
// open 이 골동품과 숨은 상태(기초 보존상태, 지반 불안정도)를 서버에서 봉인하고, action 이
// 이 순수 함수로 진행을 갱신한다. 클라는 공개 상태(노출/보존/위험/확신/힌트)만 보고
// "더 파낼지, 안정화할지, 지금 회수할지"를 결정한다.

import {
  ANTIQUES,
  ANTIQUE_THEME_LABEL,
  ANTIQUE_TIERS,
  isAntiqueId,
  pickAntiqueId,
  rollCondition,
  MIN_CONDITION,
  type AntiqueId,
} from "@/adventure/data/v2/antique";

export const TREASURE_SESSION_KEY = "treasure-session.v1";

export const ACTIONS_ALLOWED = 9;
export const MIN_EXPOSURE_TO_EXTRACT = 70;
export const COLLAPSE_RISK = 100;

export type TreasureAction = "probe" | "shovel" | "brush" | "stabilize" | "extract";

export const TREASURE_ACTION_LABEL: Record<TreasureAction, string> = {
  probe: "탐침",
  shovel: "삽질",
  brush: "붓질",
  stabilize: "보강",
  extract: "회수",
};

export const TREASURE_ACTION_HELP: Record<TreasureAction, string> = {
  probe: "유물의 윤곽과 성격을 파악합니다. 확신도가 크게 오르지만 위험도도 오릅니다.",
  shovel: "흙을 크게 걷어냅니다. 빠르지만 보존도와 위험 부담이 큽니다.",
  brush: "조심스럽게 노출도를 올립니다. 느리지만 보존도 손상이 적습니다.",
  stabilize: "무너지는 흙을 다집니다. 진행은 거의 없지만 위험도를 낮춥니다.",
  extract: "현재 상태로 유물을 회수합니다. 노출도가 낮으면 실패합니다.",
};

type ProgressAction = Exclude<TreasureAction, "extract">;

type ProgressDelta = {
  exposure: number;
  preservation: number;
  risk: number;
  certainty: number;
  message: string;
};

const PROGRESS_DELTAS: Record<ProgressAction, ProgressDelta> = {
  probe: {
    exposure: 7,
    preservation: -1,
    risk: 8,
    certainty: 26,
    message: "탐침으로 흙 아래의 윤곽을 읽었습니다.",
  },
  shovel: {
    exposure: 24,
    preservation: -8,
    risk: 18,
    certainty: 6,
    message: "삽질로 덮인 흙을 크게 걷어냈습니다.",
  },
  brush: {
    exposure: 12,
    preservation: -2,
    risk: 7,
    certainty: 12,
    message: "붓으로 표면을 조심스럽게 드러냈습니다.",
  },
  stabilize: {
    exposure: 3,
    preservation: -1,
    risk: -24,
    certainty: 4,
    message: "흙벽을 보강해 붕괴 위험을 낮췄습니다.",
  },
};

export type TreasureActionRecord = {
  action: TreasureAction;
  exposure: number;
  preservation: number;
  risk: number;
  certainty: number;
  message: string;
};

export type TreasureHint = {
  key: string;
  label: string;
};

export type TreasureSession = {
  siteId: string;
  /** 박제된 골동품 종류 (서버 전용 비밀). */
  antiqueId: AntiqueId;
  /** 서버가 굴린 기초 보존상태. 최종 보존상태의 운 요소. */
  condition: number;
  /** 지반 불안정도. 높을수록 같은 행동도 위험이 더 빨리 오른다. */
  instability: number;
  exposure: number;
  preservation: number;
  risk: number;
  certainty: number;
  actionsAllowed: number;
  actions: TreasureActionRecord[];
  openedAt: number;
};

export type TreasureSitePublic = {
  siteId: string;
  exposure: number;
  preservation: number;
  risk: number;
  certainty: number;
  actionsAllowed: number;
  actionsUsed: number;
  canExtract: boolean;
  forcedExtract: boolean;
  hints: TreasureHint[];
  actions: TreasureActionRecord[];
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function riskTax(risk: number): number {
  if (risk >= 90) return 10;
  if (risk >= 75) return 6;
  if (risk >= 60) return 3;
  return 0;
}

function instabilityForAntique(antiqueId: AntiqueId, rng: () => number): number {
  const tier = ANTIQUES[antiqueId].tier;
  const tierTax = {
    common: 0,
    uncommon: 1,
    rare: 2,
    epic: 3,
    legendary: 4,
  }[tier];
  return tierTax + Math.floor(rng() * 7);
}

export function finalConditionForSession(session: TreasureSession): number {
  return clamp(
    session.condition * 0.55 + session.preservation * 0.45,
    MIN_CONDITION,
    100,
  );
}

export function hintsForSession(session: TreasureSession): TreasureHint[] {
  const antique = ANTIQUES[session.antiqueId];
  const tier = ANTIQUE_TIERS[antique.tier];
  const hints: TreasureHint[] = [];
  if (session.certainty >= 20) {
    hints.push({
      key: "theme",
      label: `${ANTIQUE_THEME_LABEL[antique.theme]} 계열의 흔적`,
    });
  }
  if (session.certainty >= 45) {
    hints.push({
      key: "tier",
      label: `${tier.label} 등급 반응`,
    });
  }
  if (session.certainty >= 70) {
    hints.push({
      key: "value",
      label: `온전하면 약 ${antique.baseValue.toLocaleString()}G급`,
    });
  }
  if (session.certainty >= 90) {
    hints.push({
      key: "name",
      label: antique.name,
    });
  }
  return hints;
}

export function toPublicSite(s: TreasureSession): TreasureSitePublic {
  return {
    siteId: s.siteId,
    exposure: s.exposure,
    preservation: s.preservation,
    risk: s.risk,
    certainty: s.certainty,
    actionsAllowed: s.actionsAllowed,
    actionsUsed: s.actions.length,
    canExtract: s.exposure >= MIN_EXPOSURE_TO_EXTRACT,
    forcedExtract: s.actions.length >= s.actionsAllowed,
    hints: hintsForSession(s),
    actions: s.actions.map((a) => ({ ...a })),
  };
}

export function rollNewSession(args: {
  siteId: string;
  rng: () => number;
  now: number;
}): TreasureSession {
  const { siteId, rng, now } = args;
  const antiqueId = pickAntiqueId(rng);
  return {
    siteId,
    antiqueId,
    condition: rollCondition(antiqueId, rng),
    instability: instabilityForAntique(antiqueId, rng),
    exposure: 0,
    preservation: 100,
    risk: 12 + Math.floor(rng() * 10),
    certainty: 0,
    actionsAllowed: ACTIONS_ALLOWED,
    actions: [],
    openedAt: now,
  };
}

export type TreasureActionResult =
  | { kind: "invalid"; session: TreasureSession }
  | { kind: "progress"; session: TreasureSession; message: string }
  | { kind: "collapsed"; session: TreasureSession; message: string }
  | { kind: "failed"; session: TreasureSession; message: string }
  | { kind: "extracted"; session: TreasureSession; condition: number };

function appendRecord(
  session: TreasureSession,
  action: TreasureAction,
  message: string,
): TreasureSession {
  return {
    ...session,
    actions: [
      ...session.actions,
      {
        action,
        exposure: session.exposure,
        preservation: session.preservation,
        risk: session.risk,
        certainty: session.certainty,
        message,
      },
    ],
  };
}

export function applyTreasureAction(
  session: TreasureSession,
  action: TreasureAction,
): TreasureActionResult {
  if (!isTreasureAction(action)) return { kind: "invalid", session };

  if (action === "extract") {
    if (session.exposure < MIN_EXPOSURE_TO_EXTRACT) {
      const penalty = MIN_EXPOSURE_TO_EXTRACT - session.exposure;
      const next = appendRecord(
        {
          ...session,
          preservation: clamp(session.preservation - penalty, MIN_CONDITION, 100),
          risk: COLLAPSE_RISK,
        },
        action,
        "노출이 부족한 상태로 당겨 유물이 흙 속에서 부서졌습니다.",
      );
      return {
        kind: "failed",
        session: next,
        message: "노출이 부족한 상태로 당겨 유물이 흙 속에서 부서졌습니다.",
      };
    }
    const roughnessPenalty = clamp((100 - session.exposure) * 0.2, 0, 8);
    const next = appendRecord(
      {
        ...session,
        preservation: clamp(
          session.preservation - roughnessPenalty - riskTax(session.risk) * 0.5,
          MIN_CONDITION,
          100,
        ),
      },
      action,
      "유물을 회수했습니다.",
    );
    return {
      kind: "extracted",
      session: next,
      condition: finalConditionForSession(next),
    };
  }

  if (session.actions.length >= session.actionsAllowed) {
    return { kind: "invalid", session };
  }

  const delta = PROGRESS_DELTAS[action];
  const riskGain =
    delta.risk > 0 ? delta.risk + Math.ceil(session.instability / 2) : delta.risk;
  const nextRisk = clamp(session.risk + riskGain, 0, COLLAPSE_RISK);
  const next = appendRecord(
    {
      ...session,
      exposure: clamp(session.exposure + delta.exposure, 0, 100),
      preservation: clamp(
        session.preservation + delta.preservation - riskTax(nextRisk),
        MIN_CONDITION,
        100,
      ),
      risk: nextRisk,
      certainty: clamp(session.certainty + delta.certainty, 0, 100),
    },
    action,
    delta.message,
  );

  if (next.risk >= COLLAPSE_RISK) {
    return {
      kind: "collapsed",
      session: next,
      message: "지반이 무너져 발굴 지점을 잃었습니다.",
    };
  }

  return { kind: "progress", session: next, message: delta.message };
}

export function isTreasureAction(v: unknown): v is TreasureAction {
  return (
    v === "probe" ||
    v === "shovel" ||
    v === "brush" ||
    v === "stabilize" ||
    v === "extract"
  );
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return !!raw && typeof raw === "object";
}

function parseActionRecord(raw: unknown): TreasureActionRecord | null {
  if (!isRecord(raw)) return null;
  if (!isTreasureAction(raw.action)) return null;
  const exposure = raw.exposure;
  const preservation = raw.preservation;
  const risk = raw.risk;
  const certainty = raw.certainty;
  const message = raw.message;
  if (
    typeof exposure !== "number" ||
    typeof preservation !== "number" ||
    typeof risk !== "number" ||
    typeof certainty !== "number" ||
    typeof message !== "string"
  ) {
    return null;
  }
  if (
    exposure < 0 ||
    exposure > 100 ||
    preservation < MIN_CONDITION ||
    preservation > 100 ||
    risk < 0 ||
    risk > COLLAPSE_RISK ||
    certainty < 0 ||
    certainty > 100
  ) {
    return null;
  }
  return {
    action: raw.action,
    exposure: clamp(exposure, 0, 100),
    preservation: clamp(preservation, MIN_CONDITION, 100),
    risk: clamp(risk, 0, COLLAPSE_RISK),
    certainty: clamp(certainty, 0, 100),
    message,
  };
}

function parseLegacyGridSession(raw: Record<string, unknown>): TreasureSession | null {
  if (typeof raw.siteId !== "string" || !raw.siteId) return null;
  if (typeof raw.antiqueId !== "string" || !isAntiqueId(raw.antiqueId)) return null;
  const condition = raw.condition;
  if (typeof condition !== "number" || condition < MIN_CONDITION || condition > 100) {
    return null;
  }
  if (
    typeof raw.gridSize !== "number" ||
    typeof raw.treasureCell !== "number" ||
    !Array.isArray(raw.digs)
  ) {
    return null;
  }
  const migratedActions = Math.min(raw.digs.length, ACTIONS_ALLOWED);
  const exposure = clamp(migratedActions * 9, 0, 64);
  const preservation = clamp(100 - migratedActions * 3, MIN_CONDITION, 100);
  const risk = clamp(14 + migratedActions * 7, 0, 82);
  const certainty = clamp(migratedActions * 14, 0, 88);
  const actions: TreasureActionRecord[] = Array.from(
    { length: migratedActions },
    (_, idx) => ({
      action: "probe",
      exposure: clamp((idx + 1) * 9, 0, 64),
      preservation: clamp(100 - (idx + 1) * 3, MIN_CONDITION, 100),
      risk: clamp(14 + (idx + 1) * 7, 0, 82),
      certainty: clamp((idx + 1) * 14, 0, 88),
      message: "이전 발굴 기록을 새 방식으로 이전했습니다.",
    }),
  );
  return {
    siteId: raw.siteId,
    antiqueId: raw.antiqueId,
    condition: clamp(condition, MIN_CONDITION, 100),
    instability: 3,
    exposure,
    preservation,
    risk,
    certainty,
    actionsAllowed: ACTIONS_ALLOWED,
    actions,
    openedAt:
      typeof raw.openedAt === "number" && Number.isFinite(raw.openedAt)
        ? raw.openedAt
        : 0,
  };
}

// 손상/빈 입력은 null(=열린 세션 없음). 옛 격자 세션은 새 상태로 이전해 이미 쓴 지도 조각을 보존.
export function parseTreasureSession(raw: unknown): TreasureSession | null {
  if (!isRecord(raw)) return null;
  const legacy = parseLegacyGridSession(raw);
  if (legacy) return legacy;
  if (typeof raw.siteId !== "string" || !raw.siteId) return null;
  if (typeof raw.antiqueId !== "string" || !isAntiqueId(raw.antiqueId)) return null;

  const condition = raw.condition;
  const instability = raw.instability;
  const exposure = raw.exposure;
  const preservation = raw.preservation;
  const risk = raw.risk;
  const certainty = raw.certainty;
  const actionsAllowed = raw.actionsAllowed;
  if (
    typeof condition !== "number" ||
    typeof instability !== "number" ||
    typeof exposure !== "number" ||
    typeof preservation !== "number" ||
    typeof risk !== "number" ||
    typeof certainty !== "number" ||
    typeof actionsAllowed !== "number"
  ) {
    return null;
  }
  if (
    condition < MIN_CONDITION ||
    condition > 100 ||
    instability < 0 ||
    instability > 20 ||
    exposure < 0 ||
    exposure > 100 ||
    preservation < MIN_CONDITION ||
    preservation > 100 ||
    risk < 0 ||
    risk > COLLAPSE_RISK ||
    certainty < 0 ||
    certainty > 100 ||
    !Number.isInteger(actionsAllowed) ||
    actionsAllowed < 1 ||
    actionsAllowed > 20 ||
    !Array.isArray(raw.actions) ||
    raw.actions.length > actionsAllowed + 1
  ) {
    return null;
  }

  const actions: TreasureActionRecord[] = [];
  for (const a of raw.actions) {
    const parsed = parseActionRecord(a);
    if (!parsed) return null;
    actions.push(parsed);
  }

  const openedAt =
    typeof raw.openedAt === "number" && Number.isFinite(raw.openedAt)
      ? raw.openedAt
      : 0;

  return {
    siteId: raw.siteId,
    antiqueId: raw.antiqueId,
    condition: clamp(condition, MIN_CONDITION, 100),
    instability: clamp(instability, 0, 20),
    exposure: clamp(exposure, 0, 100),
    preservation: clamp(preservation, MIN_CONDITION, 100),
    risk: clamp(risk, 0, COLLAPSE_RISK),
    certainty: clamp(certainty, 0, 100),
    actionsAllowed,
    actions,
    openedAt,
  };
}
