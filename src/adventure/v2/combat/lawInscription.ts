import type {
  V2SkillEffect,
  V2SkillId,
} from "@/adventure/data/v2/v2Skills";

export type LawInscriptionState = {
  assault: number;
  reflux: number;
  erosion: number;
  ward: number;
};

export type LawInscriptionKey = keyof LawInscriptionState;

export type LawInscriptionRelease = {
  state: LawInscriptionState;
  total: number;
  distinct: number;
  diversityDamagePct: 0 | 6 | 12 | 18;
  manaRestorePctMaxMp: number;
  magicVulnerabilityPct: number;
  shieldPctMaxMp: number;
  complete: boolean;
  /** 6차 카탈로그 리밸런싱 전 원시 효과. */
  effects: readonly V2SkillEffect[];
};

const KEYS: readonly LawInscriptionKey[] = [
  "assault",
  "reflux",
  "erosion",
  "ward",
];

const GENERATOR_SKILLS = new Set<V2SkillId>([
  "v2c_runecaster_grandsigil",
  "v2c_inscriber_release",
]);

const MATERIAL_BY_INSCRIPTION: Readonly<
  Record<LawInscriptionKey, V2SkillId>
> = {
  assault: "v2c_mage_acumen",
  reflux: "v2c_caster_acumen",
  erosion: "v2c_magus_acumen3",
  ward: "v2c_runecaster_circuit",
};

const LABELS: Readonly<Record<LawInscriptionKey, string>> = {
  assault: "공격",
  reflux: "환류",
  erosion: "침식",
  ward: "수호",
};

export function emptyLawInscriptionState(): LawInscriptionState {
  return { assault: 0, reflux: 0, erosion: 0, ward: 0 };
}

function count(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(numeric)
    ? Math.min(2, Math.max(0, Math.floor(numeric)))
    : 0;
}

export function normalizeLawInscriptionState(
  state:
    | Partial<Record<LawInscriptionKey, unknown>>
    | null
    | undefined,
): LawInscriptionState {
  return {
    assault: count(state?.assault),
    reflux: count(state?.reflux),
    erosion: count(state?.erosion),
    ward: count(state?.ward),
  };
}

export function lawInscriptionTotal(
  state: Partial<LawInscriptionState> | null | undefined,
): number {
  const normalized = normalizeLawInscriptionState(state);
  return KEYS.reduce((sum, key) => sum + normalized[key], 0);
}

export function lawInscriptionDistinctCount(
  state: Partial<LawInscriptionState> | null | undefined,
): number {
  const normalized = normalizeLawInscriptionState(state);
  return KEYS.filter((key) => normalized[key] > 0).length;
}

export function canReleaseLawInscriptions(
  state: Partial<LawInscriptionState> | null | undefined,
): boolean {
  return lawInscriptionTotal(state) >= 3;
}

export function lawInscriptionGainForCast(
  skillId: V2SkillId | null | undefined,
  equipped: readonly V2SkillId[],
): LawInscriptionState {
  if (!skillId || !GENERATOR_SKILLS.has(skillId)) {
    return emptyLawInscriptionState();
  }
  const equippedSet = new Set(equipped);
  return Object.fromEntries(
    KEYS.map((key) => [key, equippedSet.has(MATERIAL_BY_INSCRIPTION[key]) ? 1 : 0]),
  ) as LawInscriptionState;
}

export function addLawInscriptionGain(
  current: Partial<LawInscriptionState> | null | undefined,
  requested: Partial<LawInscriptionState> | null | undefined,
): { state: LawInscriptionState; gained: LawInscriptionState } {
  const state = normalizeLawInscriptionState(current);
  const gain = normalizeLawInscriptionState(requested);
  const next = emptyLawInscriptionState();
  const gained = emptyLawInscriptionState();
  for (const key of KEYS) {
    next[key] = Math.min(2, state[key] + gain[key]);
    gained[key] = next[key] - state[key];
  }
  return { state: next, gained };
}

function diversityDamagePct(distinct: number): 0 | 6 | 12 | 18 {
  if (distinct >= 4) return 18;
  if (distinct === 3) return 12;
  if (distinct === 2) return 6;
  return 0;
}

function damageEffect(
  statCoef: number,
  baseFlat: number,
  multiplier: number,
): V2SkillEffect {
  return {
    kind: "damage",
    statCoef: Number((statCoef * multiplier).toFixed(3)),
    baseFlat: Math.round(baseFlat * multiplier),
    scaling: "magic",
  };
}

export function lawInscriptionRelease(
  value: Partial<LawInscriptionState> | null | undefined,
): LawInscriptionRelease {
  const state = normalizeLawInscriptionState(value);
  const total = lawInscriptionTotal(state);
  const distinct = lawInscriptionDistinctCount(state);
  const diversity = diversityDamagePct(distinct);
  const multiplier = 1 + diversity / 100;
  const manaRestorePctMaxMp = state.reflux * 4;
  const magicVulnerabilityPct = state.erosion * 7;
  const shieldPctMaxMp = state.ward * 7;
  const complete = distinct === 4;
  const effects: V2SkillEffect[] = [
    damageEffect(1.4 + total * 0.25, 320 + total * 60, multiplier),
  ];
  for (let index = 0; index < state.assault; index += 1) {
    effects.push(damageEffect(0.3, 80, multiplier));
  }
  if (manaRestorePctMaxMp > 0) {
    effects.push({ kind: "manaRestore", pctMaxMp: manaRestorePctMaxMp });
  }
  if (shieldPctMaxMp > 0) {
    effects.push({ kind: "shield", pctMaxMp: shieldPctMaxMp, turns: 3 });
  }
  if (complete) {
    effects.push(damageEffect(0.55, 160, multiplier));
    effects.push({ kind: "selfHaste", pct: 35 });
  }
  return {
    state,
    total,
    distinct,
    diversityDamagePct: diversity,
    manaRestorePctMaxMp,
    magicVulnerabilityPct,
    shieldPctMaxMp,
    complete,
    effects,
  };
}

function activeParts(state: LawInscriptionState): string[] {
  return KEYS.filter((key) => state[key] > 0).map(
    (key) => `${LABELS[key]} ${state[key]}`,
  );
}

export function lawInscriptionSnapshot(
  value: Partial<LawInscriptionState> | null | undefined,
): Record<string, string> | undefined {
  const state = normalizeLawInscriptionState(value);
  const total = lawInscriptionTotal(state);
  return total > 0
    ? { lawInscriptions: `${total}/8 · ${activeParts(state).join(" · ")}` }
    : undefined;
}

export function mergeLawInscriptionSnapshot(
  base: Record<string, number | string> | null | undefined,
  value: Partial<LawInscriptionState> | null | undefined,
): Record<string, number | string> | undefined {
  const merged = { ...(base ?? {}), ...(lawInscriptionSnapshot(value) ?? {}) };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

export function lawInscriptionGainLog(
  gainedValue: Partial<LawInscriptionState> | null | undefined,
  nextValue: Partial<LawInscriptionState> | null | undefined,
): string | undefined {
  const gained = normalizeLawInscriptionState(gainedValue);
  if (lawInscriptionTotal(gained) === 0) return undefined;
  const parts = KEYS.filter((key) => gained[key] > 0).map(
    (key) => `${LABELS[key]} +${gained[key]}`,
  );
  return `법칙 각인: ${parts.join(" · ")} (총 ${lawInscriptionTotal(nextValue)}/8)`;
}

export function lawInscriptionConsumeLog(
  value: Partial<LawInscriptionState> | null | undefined,
): string | undefined {
  const state = normalizeLawInscriptionState(value);
  if (!canReleaseLawInscriptions(state)) return undefined;
  return `만상각인 해방: ${activeParts(state).join(" · ")} 소비`;
}
