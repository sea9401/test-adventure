// 발굴 미니게임 — 유물 노출도/보존도/붕괴 위험을 관리하는 발굴 상태 머신.
//
// main 의 탐사지 선택/현장 이벤트/업적 보상 흐름은 유지하고, 칸 맞추기 격자 룰만
// "더 파낼지, 안정화할지, 지금 회수할지"를 판단하는 행동형 게임으로 교체한다.

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
    effectLabel: "주화·장신구 확률 증가 · 행동 +1회 · 보존 -3",
    actionMod: 1,
    conditionBonus: -3,
    themeWeightMultiplier: { coin: 2.2, ornament: 1.6 },
    tierWeightMultiplier: { common: 1.15, uncommon: 1.15 },
  },
  {
    id: "royal_tomb",
    name: "왕가의 묘역",
    summary: "깊이 봉인된 대신 값진 부장품이 나올 수 있는 곳.",
    effectLabel: "희귀 이상 확률 증가 · 행동 -1회",
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
    summary: "얇은 벽 너머에 숨은 공간이 있습니다. 탐침으로 확인해야 가치가 살아납니다.",
    effectLabel: "탐침 사용 후 성공 시 감정가 +25%",
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
  siteOptionId: TreasureSiteOptionId;
  fieldEventId: TreasureFieldEventId | null;
  antiqueId: AntiqueId;
  condition: number;
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
  siteOption: Pick<TreasureSiteOption, "id" | "name" | "summary" | "effectLabel"> & {
    actionMod: number;
    conditionBonus: number;
  };
  fieldEvent: Pick<
    TreasureFieldEvent,
    "id" | "name" | "summary" | "effectLabel" | "requiresProbe"
  > | null;
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

function clampCondition(condition: number): number {
  return clamp(condition, MIN_CONDITION, 100);
}

function riskTax(risk: number): number {
  if (risk >= 90) return 10;
  if (risk >= 75) return 6;
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

export function treasureUsedProbe(session: TreasureSession): boolean {
  return session.actions.some((record) => record.action === "probe");
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
  return clampCondition(
    session.condition * 0.55 +
      session.preservation * 0.45 +
      (fieldEvent?.conditionBonus ?? 0),
  );
}

export const treasureConditionAfterHit = finalConditionForSession;

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
    hints.push({ key: "tier", label: `${tier.label} 등급 반응` });
  }
  if (session.certainty >= 70) {
    hints.push({
      key: "value",
      label: `온전하면 약 ${antique.baseValue.toLocaleString()}G급`,
    });
  }
  if (session.certainty >= 90) {
    hints.push({ key: "name", label: antique.name });
  }
  return hints;
}

export function toPublicSite(s: TreasureSession): TreasureSitePublic {
  const siteOption = treasureSiteOptionById(s.siteOptionId);
  const fieldEvent = treasureFieldEventById(s.fieldEventId);
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
    exposure: 0,
    preservation: 100,
    risk: 12 + Math.floor(rng() * 10),
    certainty: 0,
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
  const siteOptionId = isTreasureSiteOptionId(raw.siteOptionId)
    ? raw.siteOptionId
    : DEFAULT_TREASURE_SITE_OPTION_ID;
  const fieldEventId = isTreasureFieldEventId(raw.fieldEventId)
    ? raw.fieldEventId
    : null;
  const migratedActions = Math.min(raw.digs.length, ACTIONS_ALLOWED);
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
    siteOptionId,
    fieldEventId,
    antiqueId: raw.antiqueId,
    condition: clampCondition(condition),
    instability: 3,
    exposure: clamp(migratedActions * 9, 0, 64),
    preservation: clamp(100 - migratedActions * 3, MIN_CONDITION, 100),
    risk: clamp(14 + migratedActions * 7, 0, 82),
    certainty: clamp(migratedActions * 14, 0, 88),
    actionsAllowed: Math.max(
      1,
      ACTIONS_ALLOWED + treasureSiteOptionById(siteOptionId).actionMod,
    ),
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

  const siteOptionId = isTreasureSiteOptionId(raw.siteOptionId)
    ? raw.siteOptionId
    : DEFAULT_TREASURE_SITE_OPTION_ID;
  const fieldEventId = isTreasureFieldEventId(raw.fieldEventId)
    ? raw.fieldEventId
    : null;
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
    siteOptionId,
    fieldEventId,
    antiqueId: raw.antiqueId,
    condition: clampCondition(condition),
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
