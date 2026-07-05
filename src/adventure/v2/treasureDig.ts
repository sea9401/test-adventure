// 발굴 미니게임 — 심도 돌파형 "들고 나갈까, 더 내려갈까" 상태 머신.
//
// 탐사지 선택/현장 이벤트/업적 보상 흐름은 유지하고, 발굴 판정은 전리품과 붕괴 위험
// 사이에서 철수 타이밍을 고르는 push-your-luck 구조로 처리한다.

import {
  ANTIQUES,
  ANTIQUE_THEME_LABEL,
  ANTIQUE_TIERS,
  ANTIQUE_TIER_ORDER,
  isAntiqueId,
  rollCondition,
  MIN_CONDITION,
  type AntiqueId,
  type AntiqueTheme,
  type AntiqueTier,
} from "@/adventure/data/v2/antique";

export const TREASURE_SESSION_KEY = "treasure-session.v1";

export const ACTIONS_ALLOWED = 8;
export const MAX_DEPTH = 5;
export const COLLAPSE_RISK = 100;

export type TreasureAction =
  | "descend"
  | "secure"
  | "detour"
  | "excavate"
  | "retreat";

export const TREASURE_ACTION_LABEL: Record<TreasureAction, string> = {
  descend: "더 내려가기",
  secure: "보강",
  detour: "우회",
  excavate: "정밀 발굴",
  retreat: "챙기고 나가기",
};

export const TREASURE_ACTION_HELP: Record<TreasureAction, string> = {
  descend: "다음 층으로 곧장 내려갑니다. 보상이 크지만 붕괴 위험도 크게 오릅니다.",
  secure: "버팀목을 세워 안정도를 회복하고 붕괴 위험을 낮춥니다.",
  detour: "무른 지반을 피해 한 층 내려갑니다. 보상은 줄지만 위험 증가가 작습니다.",
  excavate: "현재 층을 더 훑어 전리품과 판독 정보를 얻습니다.",
  retreat: "지금까지 챙긴 전리품을 들고 발굴을 끝냅니다.",
};

export type TreasureSiteOptionId =
  | "old_market"
  | "royal_tomb"
  | "collapsed_shrine";

export type TreasureSiteOption = {
  id: TreasureSiteOptionId;
  name: string;
  summary: string;
  effectLabel: string;
  actionMod: number;
  conditionBonus: number;
  tierWeightMultiplier?: Partial<Record<AntiqueTier, number>>;
  themeWeightMultiplier?: Partial<Record<AntiqueTheme, number>>;
};

export const TREASURE_SITE_OPTIONS: readonly TreasureSiteOption[] = [
  {
    id: "old_market",
    name: "옛 시장터",
    summary: "주화와 장신구가 많이 묻힌 넓은 터.",
    effectLabel: "주화·장신구 확률 증가 · 선택 +1회 · 보존 -3",
    actionMod: 1,
    conditionBonus: -3,
    themeWeightMultiplier: { coin: 2.2, ornament: 1.6 },
    tierWeightMultiplier: { common: 1.15, uncommon: 1.15 },
  },
  {
    id: "royal_tomb",
    name: "왕가의 묘역",
    summary: "깊이 봉인된 대신 값진 부장품이 나올 수 있는 곳.",
    effectLabel: "희귀 이상 확률 증가 · 선택 -1회",
    actionMod: -1,
    conditionBonus: 0,
    tierWeightMultiplier: { rare: 1.65, epic: 1.85, legendary: 2.1 },
  },
  {
    id: "collapsed_shrine",
    name: "무너진 사당",
    summary: "유물장식이 온전한 상태로 남기 쉬운 조용한 폐허.",
    effectLabel: "유물장식 확률 증가 · 보존 +8",
    actionMod: 0,
    conditionBonus: 8,
    themeWeightMultiplier: { relic: 2.3 },
  },
] as const;

export const DEFAULT_TREASURE_SITE_OPTION_ID: TreasureSiteOptionId =
  "old_market";

export function isTreasureSiteOptionId(v: unknown): v is TreasureSiteOptionId {
  return TREASURE_SITE_OPTIONS.some((site) => site.id === v);
}

export function treasureSiteOptionById(
  siteOptionId: TreasureSiteOptionId,
): TreasureSiteOption {
  return (
    TREASURE_SITE_OPTIONS.find((site) => site.id === siteOptionId) ??
    TREASURE_SITE_OPTIONS[0]
  );
}

export type TreasureFieldEventId =
  | "intact_layer"
  | "buried_cache"
  | "sealed_chamber";

export type TreasureFieldEvent = {
  id: TreasureFieldEventId;
  name: string;
  summary: string;
  effectLabel: string;
  weight: number;
  conditionBonus: number;
  appraisalBonusPct: number;
  requiresProbe: boolean;
};

export const TREASURE_FIELD_EVENTS: readonly TreasureFieldEvent[] = [
  {
    id: "intact_layer",
    name: "온전한 유물층",
    summary: "토층이 무너지지 않아 유물이 비교적 온전하게 남아 있습니다.",
    effectLabel: "성공 시 보존상태 +10",
    weight: 40,
    conditionBonus: 10,
    appraisalBonusPct: 0,
    requiresProbe: false,
  },
  {
    id: "buried_cache",
    name: "묻힌 보관함",
    summary: "낡은 보관함 흔적이 보여 감정 가치가 조금 더 붙습니다.",
    effectLabel: "성공 시 감정가 +15%",
    weight: 35,
    conditionBonus: 0,
    appraisalBonusPct: 15,
    requiresProbe: false,
  },
  {
    id: "sealed_chamber",
    name: "봉인된 방",
    summary: "얇은 벽 너머에 숨은 공간이 있습니다. 정밀 발굴로 확인해야 가치가 살아납니다.",
    effectLabel: "정밀 발굴 후 성공 시 감정가 +25%",
    weight: 25,
    conditionBonus: 0,
    appraisalBonusPct: 25,
    requiresProbe: true,
  },
] as const;

export function isTreasureFieldEventId(v: unknown): v is TreasureFieldEventId {
  return TREASURE_FIELD_EVENTS.some((event) => event.id === v);
}

export function treasureFieldEventById(
  eventId: TreasureFieldEventId | null,
): TreasureFieldEvent | null {
  if (!eventId) return null;
  return TREASURE_FIELD_EVENTS.find((event) => event.id === eventId) ?? null;
}

type ProgressAction = Exclude<TreasureAction, "retreat">;

export type TreasureActionRecord = {
  action: TreasureAction;
  depth: number;
  haul: number;
  stability: number;
  risk: number;
  insight: number;
  message: string;
};

export type TreasureHint = {
  key: string;
  label: string;
};

export type TreasureSession = {
  siteId: string;
  siteOptionId: TreasureSiteOptionId;
  fieldEventId: TreasureFieldEventId | null;
  antiqueId: AntiqueId;
  condition: number;
  instability: number;
  depth: number;
  maxDepth: number;
  haul: number;
  stability: number;
  risk: number;
  insight: number;
  actionsAllowed: number;
  actions: TreasureActionRecord[];
  openedAt: number;
};

export type TreasureSitePublic = {
  siteId: string;
  siteOption: Pick<TreasureSiteOption, "id" | "name" | "summary" | "effectLabel"> & {
    actionMod: number;
    conditionBonus: number;
  };
  fieldEvent: Pick<
    TreasureFieldEvent,
    "id" | "name" | "summary" | "effectLabel" | "requiresProbe"
  > | null;
  depth: number;
  maxDepth: number;
  haul: number;
  stability: number;
  risk: number;
  insight: number;
  actionsAllowed: number;
  actionsUsed: number;
  canRetreat: boolean;
  forcedRetreat: boolean;
  nextDepthReward: number;
  nextDepthRisk: number;
  hints: TreasureHint[];
  actions: TreasureActionRecord[];
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function clampCondition(condition: number): number {
  return clamp(condition, MIN_CONDITION, 100);
}

function riskTax(risk: number): number {
  if (risk >= 90) return 12;
  if (risk >= 75) return 7;
  if (risk >= 60) return 3;
  return 0;
}

function pickAntiqueIdForSite(
  rng: () => number,
  siteOption: TreasureSiteOption,
): AntiqueId {
  const antiques = Object.values(ANTIQUES);
  const tierCounts = antiques.reduce(
    (counts, antique) => counts.set(antique.tier, (counts.get(antique.tier) ?? 0) + 1),
    new Map<AntiqueTier, number>(),
  );
  const candidates = antiques.map((antique) => {
    const tierMeta = ANTIQUE_TIERS[antique.tier];
    const tierMultiplier = siteOption.tierWeightMultiplier?.[antique.tier] ?? 1;
    const themeMultiplier =
      siteOption.themeWeightMultiplier?.[antique.theme] ?? 1;
    const baseWeight = tierMeta.digRarityWeight / (tierCounts.get(antique.tier) ?? 1);
    return {
      antique,
      weight: Math.max(0, baseWeight * tierMultiplier * themeMultiplier),
    };
  });
  const total = candidates.reduce((sum, c) => sum + c.weight, 0);
  let roll = rng() * total;
  for (const candidate of candidates) {
    if (roll < candidate.weight) return candidate.antique.id;
    roll -= candidate.weight;
  }
  const fallbackTier = ANTIQUE_TIER_ORDER[0];
  return (
    Object.values(ANTIQUES).find((antique) => antique.tier === fallbackTier)
      ?.id ?? "clay_shard"
  );
}

function pickTreasureFieldEventId(rng: () => number): TreasureFieldEventId {
  const total = TREASURE_FIELD_EVENTS.reduce((sum, event) => sum + event.weight, 0);
  let roll = rng() * total;
  for (const event of TREASURE_FIELD_EVENTS) {
    if (roll < event.weight) return event.id;
    roll -= event.weight;
  }
  return TREASURE_FIELD_EVENTS[0].id;
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

function layerReward(depth: number): number {
  const rewards = [0, 16, 32, 55, 86, 128] as const;
  return rewards[clamp(depth, 0, MAX_DEPTH)] ?? rewards[MAX_DEPTH];
}

function nextDepthRisk(session: TreasureSession, mode: "direct" | "detour"): number {
  const nextDepth = clamp(session.depth + 1, 1, session.maxDepth);
  const base =
    mode === "direct"
      ? 12 + nextDepth * 7 + Math.ceil(session.instability / 2)
      : 7 + nextDepth * 4 + Math.ceil(session.instability / 3);
  const footingBonus = session.stability >= 82 ? -3 : session.stability <= 35 ? 5 : 0;
  return Math.max(1, base + footingBonus);
}

export function treasureUsedProbe(session: TreasureSession): boolean {
  return session.actions.some((record) => record.action === "excavate");
}

export function treasureAppraisalBonusPct(session: TreasureSession): number {
  const fieldEvent = treasureFieldEventById(session.fieldEventId);
  if (!fieldEvent) return 0;
  if (fieldEvent.requiresProbe && !treasureUsedProbe(session)) return 0;
  return fieldEvent.appraisalBonusPct;
}

export function applyTreasureAppraisalBonus(
  appraisedValue: number,
  bonusPct: number,
): number {
  return Math.floor((appraisedValue * (100 + bonusPct)) / 100);
}

export function finalConditionForSession(session: TreasureSession): number {
  const fieldEvent = treasureFieldEventById(session.fieldEventId);
  const depthBonus = Math.min(22, session.depth * 4 + session.haul * 0.07);
  return clampCondition(
    session.condition * 0.42 +
      session.stability * 0.38 +
      depthBonus +
      session.insight * 0.06 -
      riskTax(session.risk) +
      (fieldEvent?.conditionBonus ?? 0),
  );
}

export const treasureConditionAfterHit = finalConditionForSession;

export function hintsForSession(session: TreasureSession): TreasureHint[] {
  const antique = ANTIQUES[session.antiqueId];
  const tier = ANTIQUE_TIERS[antique.tier];
  const hints: TreasureHint[] = [];
  if (session.insight >= 15) {
    hints.push({
      key: "theme",
      label: `${ANTIQUE_THEME_LABEL[antique.theme]} 계열 흔적`,
    });
  }
  if (session.insight >= 35) {
    hints.push({ key: "tier", label: `${tier.label} 등급 반응` });
  }
  if (session.insight >= 60) {
    hints.push({
      key: "value",
      label: `온전하면 약 ${antique.baseValue.toLocaleString()}G급`,
    });
  }
  if (session.insight >= 85 || session.depth >= session.maxDepth) {
    hints.push({ key: "name", label: antique.name });
  }
  return hints;
}

export function toPublicSite(s: TreasureSession): TreasureSitePublic {
  const siteOption = treasureSiteOptionById(s.siteOptionId);
  const fieldEvent = treasureFieldEventById(s.fieldEventId);
  const actionsUsed = s.actions.length;
  return {
    siteId: s.siteId,
    siteOption: {
      id: siteOption.id,
      name: siteOption.name,
      summary: siteOption.summary,
      effectLabel: siteOption.effectLabel,
      actionMod: siteOption.actionMod,
      conditionBonus: siteOption.conditionBonus,
    },
    fieldEvent: fieldEvent
      ? {
          id: fieldEvent.id,
          name: fieldEvent.name,
          summary: fieldEvent.summary,
          effectLabel: fieldEvent.effectLabel,
          requiresProbe: fieldEvent.requiresProbe,
        }
      : null,
    depth: s.depth,
    maxDepth: s.maxDepth,
    haul: s.haul,
    stability: s.stability,
    risk: s.risk,
    insight: s.insight,
    actionsAllowed: s.actionsAllowed,
    actionsUsed,
    canRetreat: s.haul > 0,
    forcedRetreat: actionsUsed >= s.actionsAllowed || s.depth >= s.maxDepth,
    nextDepthReward: s.depth >= s.maxDepth ? 0 : layerReward(s.depth + 1),
    nextDepthRisk: s.depth >= s.maxDepth ? 0 : nextDepthRisk(s, "direct"),
    hints: hintsForSession(s),
    actions: s.actions.map((a) => ({ ...a })),
  };
}

export function rollNewSession(args: {
  siteId: string;
  siteOptionId?: TreasureSiteOptionId;
  rng: () => number;
  now: number;
}): TreasureSession {
  const {
    siteId,
    siteOptionId = DEFAULT_TREASURE_SITE_OPTION_ID,
    rng,
    now,
  } = args;
  const siteOption = treasureSiteOptionById(siteOptionId);
  const antiqueId = pickAntiqueIdForSite(rng, siteOption);
  return {
    siteId,
    siteOptionId: siteOption.id,
    fieldEventId: pickTreasureFieldEventId(rng),
    antiqueId,
    condition: clampCondition(
      rollCondition(antiqueId, rng) + siteOption.conditionBonus,
    ),
    instability: instabilityForAntique(antiqueId, rng),
    depth: 0,
    maxDepth: MAX_DEPTH,
    haul: 0,
    stability: 88 + Math.floor(rng() * 9),
    risk: 10 + Math.floor(rng() * 10),
    insight: 0,
    actionsAllowed: Math.max(1, ACTIONS_ALLOWED + siteOption.actionMod),
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
        depth: session.depth,
        haul: session.haul,
        stability: session.stability,
        risk: session.risk,
        insight: session.insight,
        message,
      },
    ],
  };
}

function applyProgress(
  session: TreasureSession,
  action: ProgressAction,
): TreasureSession {
  if (action === "secure") {
    return {
      ...session,
      stability: clamp(session.stability + 14, 0, 100),
      risk: clamp(session.risk - 24 - Math.floor(session.stability / 25), 0, COLLAPSE_RISK),
      insight: clamp(session.insight + 4, 0, 100),
    };
  }

  if (action === "excavate") {
    const depth = Math.max(1, session.depth);
    const nextRisk = clamp(
      session.risk + 9 + depth * 5 + Math.ceil(session.instability / 2),
      0,
      COLLAPSE_RISK,
    );
    return {
      ...session,
      haul: clamp(session.haul + layerReward(depth) * 0.45, 0, 999),
      stability: clamp(session.stability - (4 + depth + riskTax(nextRisk)), 0, 100),
      risk: nextRisk,
      insight: clamp(session.insight + 18 + depth, 0, 100),
    };
  }

  const nextDepth = clamp(session.depth + 1, 1, session.maxDepth);
  const direct = action === "descend";
  const riskGain = nextDepthRisk(session, direct ? "direct" : "detour");
  const nextRisk = clamp(session.risk + riskGain, 0, COLLAPSE_RISK);
  return {
    ...session,
    depth: nextDepth,
    haul: clamp(
      session.haul + layerReward(nextDepth) * (direct ? 1 : 0.58),
      0,
      999,
    ),
    stability: clamp(
      session.stability - (direct ? 7 + nextDepth * 2 : 4 + nextDepth),
      0,
      100,
    ),
    risk: nextRisk,
    insight: clamp(session.insight + (direct ? 10 + nextDepth * 2 : 7 + nextDepth), 0, 100),
  };
}

function progressMessage(action: ProgressAction, after: TreasureSession) {
  if (action === "secure") return "버팀목을 세워 지반을 붙잡았습니다.";
  if (action === "excavate") return "현재 층을 훑어 들고 나갈 발견물을 더 챙겼습니다.";
  if (action === "detour") {
    return `${after.depth}층으로 우회했습니다. 전리품은 줄었지만 길이 안정적입니다.`;
  }
  return `${after.depth}층까지 내려갔습니다. 더 큰 발견물이 손에 들어왔습니다.`;
}

export function applyTreasureAction(
  session: TreasureSession,
  action: TreasureAction,
): TreasureActionResult {
  if (!isTreasureAction(action)) return { kind: "invalid", session };

  if (action === "retreat") {
    if (session.haul <= 0) {
      const message = "챙길 발견물이 없는 상태로 철수해 발굴이 무산됐습니다.";
      const next = appendRecord(session, action, message);
      return { kind: "failed", session: next, message };
    }
    const next = appendRecord(session, action, "발견물을 들고 지상으로 철수했습니다.");
    return {
      kind: "extracted",
      session: next,
      condition: finalConditionForSession(next),
    };
  }

  if (session.actions.length >= session.actionsAllowed || session.depth >= session.maxDepth) {
    return { kind: "invalid", session };
  }

  const progressed = applyProgress(session, action);
  const message = progressMessage(action, progressed);
  const next = appendRecord(progressed, action, message);

  if (next.risk >= COLLAPSE_RISK || next.stability <= 0) {
    return {
      kind: "collapsed",
      session: next,
      message: "갱도가 무너져 들고 있던 발견물을 모두 잃었습니다.",
    };
  }

  return { kind: "progress", session: next, message };
}

export function isTreasureAction(v: unknown): v is TreasureAction {
  return (
    v === "descend" ||
    v === "secure" ||
    v === "detour" ||
    v === "excavate" ||
    v === "retreat"
  );
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return !!raw && typeof raw === "object";
}

function parseActionRecord(raw: unknown): TreasureActionRecord | null {
  if (!isRecord(raw)) return null;
  if (!isTreasureAction(raw.action)) return null;
  const { depth, haul, stability, risk, insight, message } = raw;
  if (
    typeof depth !== "number" ||
    typeof haul !== "number" ||
    typeof stability !== "number" ||
    typeof risk !== "number" ||
    typeof insight !== "number" ||
    typeof message !== "string"
  ) {
    return null;
  }
  if (
    depth < 0 ||
    depth > MAX_DEPTH ||
    haul < 0 ||
    haul > 999 ||
    stability < 0 ||
    stability > 100 ||
    risk < 0 ||
    risk > COLLAPSE_RISK ||
    insight < 0 ||
    insight > 100
  ) {
    return null;
  }
  return {
    action: raw.action,
    depth: clamp(depth, 0, MAX_DEPTH),
    haul: clamp(haul, 0, 999),
    stability: clamp(stability, 0, 100),
    risk: clamp(risk, 0, COLLAPSE_RISK),
    insight: clamp(insight, 0, 100),
    message,
  };
}

function parseSiteOptionId(raw: unknown): TreasureSiteOptionId {
  return isTreasureSiteOptionId(raw) ? raw : DEFAULT_TREASURE_SITE_OPTION_ID;
}

function parseFieldEventId(raw: unknown): TreasureFieldEventId | null {
  return isTreasureFieldEventId(raw) ? raw : null;
}

function legacyRecord(
  action: TreasureAction,
  depth: number,
  haul: number,
  stability: number,
  risk: number,
  insight: number,
  message: string,
): TreasureActionRecord {
  return { action, depth, haul, stability, risk, insight, message };
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
  const depth = clamp(Math.floor(migratedActions / 2), 0, 2);
  const haul = clamp(migratedActions * 18, 0, 140);
  const stability = clamp(92 - migratedActions * 4, 0, 100);
  const risk = clamp(14 + migratedActions * 7, 0, 82);
  const insight = clamp(migratedActions * 14, 0, 88);
  const actions: TreasureActionRecord[] = Array.from(
    { length: migratedActions },
    (_, idx) =>
      legacyRecord(
        "excavate",
        clamp(Math.floor((idx + 1) / 2), 0, 2),
        clamp((idx + 1) * 18, 0, 140),
        clamp(92 - (idx + 1) * 4, 0, 100),
        clamp(14 + (idx + 1) * 7, 0, 82),
        clamp((idx + 1) * 14, 0, 88),
        "이전 발굴 기록을 심도 돌파형으로 이전했습니다.",
      ),
  );
  return {
    siteId: raw.siteId,
    siteOptionId: parseSiteOptionId(raw.siteOptionId),
    fieldEventId: parseFieldEventId(raw.fieldEventId),
    antiqueId: raw.antiqueId,
    condition: clampCondition(condition),
    instability: 3,
    depth,
    maxDepth: MAX_DEPTH,
    haul,
    stability,
    risk,
    insight,
    actionsAllowed: ACTIONS_ALLOWED,
    actions,
    openedAt:
      typeof raw.openedAt === "number" && Number.isFinite(raw.openedAt)
        ? raw.openedAt
        : 0,
  };
}

function parseLegacyExposureSession(raw: Record<string, unknown>): TreasureSession | null {
  if (typeof raw.siteId !== "string" || !raw.siteId) return null;
  if (typeof raw.antiqueId !== "string" || !isAntiqueId(raw.antiqueId)) return null;
  const { condition, exposure, preservation, risk, certainty } = raw;
  if (
    typeof condition !== "number" ||
    typeof exposure !== "number" ||
    typeof preservation !== "number" ||
    typeof risk !== "number" ||
    typeof certainty !== "number"
  ) {
    return null;
  }
  if (
    condition < MIN_CONDITION ||
    condition > 100 ||
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
  const sourceActions = Array.isArray(raw.actions) ? raw.actions : [];
  const migratedActions = Math.min(sourceActions.length, ACTIONS_ALLOWED);
  const depth = clamp(Math.floor(exposure / 24), 0, MAX_DEPTH - 1);
  const haul = clamp(exposure * 1.2 + migratedActions * 8, 0, 220);
  const stability = clamp(preservation, 0, 100);
  const insight = clamp(certainty, 0, 100);
  const actions: TreasureActionRecord[] = Array.from(
    { length: migratedActions },
    (_, idx) =>
      legacyRecord(
        "excavate",
        clamp(Math.floor(((idx + 1) / Math.max(1, migratedActions)) * depth), 0, MAX_DEPTH),
        clamp(((idx + 1) / Math.max(1, migratedActions)) * haul, 0, 220),
        clamp(100 - (idx + 1) * 5, 0, 100),
        clamp(12 + (idx + 1) * 8, 0, 90),
        clamp(((idx + 1) / Math.max(1, migratedActions)) * insight, 0, 100),
        "이전 발굴 기록을 심도 돌파형으로 이전했습니다.",
      ),
  );
  return {
    siteId: raw.siteId,
    siteOptionId: parseSiteOptionId(raw.siteOptionId),
    fieldEventId: parseFieldEventId(raw.fieldEventId),
    antiqueId: raw.antiqueId,
    condition: clampCondition(condition),
    instability:
      typeof raw.instability === "number" && raw.instability >= 0 && raw.instability <= 20
        ? clamp(raw.instability, 0, 20)
        : 3,
    depth,
    maxDepth: MAX_DEPTH,
    haul,
    stability,
    risk: clamp(risk, 0, 92),
    insight,
    actionsAllowed: ACTIONS_ALLOWED,
    actions,
    openedAt:
      typeof raw.openedAt === "number" && Number.isFinite(raw.openedAt)
        ? raw.openedAt
        : 0,
  };
}

export function parseTreasureSession(raw: unknown): TreasureSession | null {
  if (!isRecord(raw)) return null;
  const legacyGrid = parseLegacyGridSession(raw);
  if (legacyGrid) return legacyGrid;
  const legacyExposure = parseLegacyExposureSession(raw);
  if (legacyExposure) return legacyExposure;

  if (typeof raw.siteId !== "string" || !raw.siteId) return null;
  if (!isTreasureSiteOptionId(raw.siteOptionId)) return null;
  if (raw.fieldEventId !== null && !isTreasureFieldEventId(raw.fieldEventId)) return null;
  if (typeof raw.antiqueId !== "string" || !isAntiqueId(raw.antiqueId)) return null;

  const { condition, instability, depth, maxDepth, haul, stability, risk, insight } = raw;
  const actionsAllowed = raw.actionsAllowed;
  if (
    typeof condition !== "number" ||
    typeof instability !== "number" ||
    typeof depth !== "number" ||
    typeof maxDepth !== "number" ||
    typeof haul !== "number" ||
    typeof stability !== "number" ||
    typeof risk !== "number" ||
    typeof insight !== "number" ||
    typeof actionsAllowed !== "number"
  ) {
    return null;
  }
  if (
    condition < MIN_CONDITION ||
    condition > 100 ||
    instability < 0 ||
    instability > 20 ||
    depth < 0 ||
    depth > MAX_DEPTH ||
    maxDepth < 1 ||
    maxDepth > MAX_DEPTH ||
    depth > maxDepth ||
    haul < 0 ||
    haul > 999 ||
    stability < 0 ||
    stability > 100 ||
    risk < 0 ||
    risk > COLLAPSE_RISK ||
    insight < 0 ||
    insight > 100 ||
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
    siteOptionId: raw.siteOptionId,
    fieldEventId: raw.fieldEventId,
    antiqueId: raw.antiqueId,
    condition: clampCondition(condition),
    instability: clamp(instability, 0, 20),
    depth: clamp(depth, 0, MAX_DEPTH),
    maxDepth: clamp(maxDepth, 1, MAX_DEPTH),
    haul: clamp(haul, 0, 999),
    stability: clamp(stability, 0, 100),
    risk: clamp(risk, 0, COLLAPSE_RISK),
    insight: clamp(insight, 0, 100),
    actionsAllowed,
    actions,
    openedAt,
  };
}
