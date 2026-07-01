export type SparringDummyPresetId =
  | "sandbag"
  | "guard"
  | "evasive"
  | "striker"
  | "boss";

export type SparringDummyConfig = {
  hp: number;
  atk: number;
  def: number;
  spd: number;
  accuracy: number;
  evasionPct: number;
  critPct: number;
  critMult: number;
  maxTurns: number;
};

export type SparringDummyField = keyof SparringDummyConfig;

type SparringDummyFieldLimit = {
  label: string;
  min: number;
  max: number;
  step: number;
};

export const SPARRING_DUMMY_FIELD_LIMITS: Record<
  SparringDummyField,
  SparringDummyFieldLimit
> = {
  hp: { label: "HP", min: 1_000, max: 10_000_000, step: 10_000 },
  atk: { label: "공격력", min: 0, max: 100_000, step: 10 },
  def: { label: "방어력", min: 0, max: 100_000, step: 10 },
  spd: { label: "속도", min: 1, max: 300, step: 1 },
  accuracy: { label: "명중", min: 0, max: 1_000, step: 1 },
  evasionPct: { label: "회피", min: 0, max: 300, step: 1 },
  critPct: { label: "치명률", min: 0, max: 100, step: 1 },
  critMult: { label: "치명 배율", min: 1, max: 5, step: 0.1 },
  maxTurns: { label: "턴 수", min: 1, max: 100, step: 1 },
};

export const SPARRING_DUMMY_FIELD_ORDER: readonly SparringDummyField[] = [
  "hp",
  "atk",
  "def",
  "spd",
  "accuracy",
  "evasionPct",
  "critPct",
  "critMult",
  "maxTurns",
];

export const DEFAULT_SPAR_DUMMY_CONFIG: SparringDummyConfig = {
  hp: 1_000_000,
  atk: 0,
  def: 0,
  spd: 1,
  accuracy: 0,
  evasionPct: 0,
  critPct: 0,
  critMult: 1.5,
  maxTurns: 50,
};

export const SPARRING_DUMMY_PRESETS: readonly {
  id: SparringDummyPresetId;
  label: string;
  config: SparringDummyConfig;
}[] = [
  {
    id: "sandbag",
    label: "샌드백",
    config: DEFAULT_SPAR_DUMMY_CONFIG,
  },
  {
    id: "guard",
    label: "방어형",
    config: {
      hp: 1_000_000,
      atk: 0,
      def: 500,
      spd: 1,
      accuracy: 0,
      evasionPct: 0,
      critPct: 0,
      critMult: 1.5,
      maxTurns: 50,
    },
  },
  {
    id: "evasive",
    label: "회피형",
    config: {
      hp: 800_000,
      atk: 0,
      def: 100,
      spd: 40,
      accuracy: 0,
      evasionPct: 80,
      critPct: 0,
      critMult: 1.5,
      maxTurns: 50,
    },
  },
  {
    id: "striker",
    label: "공격형",
    config: {
      hp: 500_000,
      atk: 300,
      def: 100,
      spd: 30,
      accuracy: 120,
      evasionPct: 10,
      critPct: 25,
      critMult: 1.5,
      maxTurns: 50,
    },
  },
  {
    id: "boss",
    label: "보스형",
    config: {
      hp: 3_000_000,
      atk: 1_000,
      def: 800,
      spd: 50,
      accuracy: 180,
      evasionPct: 25,
      critPct: 35,
      critMult: 1.8,
      maxTurns: 80,
    },
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function clampField(field: SparringDummyField, value: unknown): number {
  const limit = SPARRING_DUMMY_FIELD_LIMITS[field];
  const fallback = DEFAULT_SPAR_DUMMY_CONFIG[field];
  const raw = readNumber(value) ?? fallback;
  const normalized =
    field === "critMult" ? Math.round(raw * 10) / 10 : Math.trunc(raw);
  return Math.min(limit.max, Math.max(limit.min, normalized));
}

export function sanitizeSparringDummyConfig(raw: unknown): SparringDummyConfig {
  const source =
    isRecord(raw) && isRecord(raw.dummy)
      ? raw.dummy
      : isRecord(raw)
        ? raw
        : {};
  return {
    hp: clampField("hp", source.hp),
    atk: clampField("atk", source.atk),
    def: clampField("def", source.def),
    spd: clampField("spd", source.spd),
    accuracy: clampField("accuracy", source.accuracy),
    evasionPct: clampField("evasionPct", source.evasionPct),
    critPct: clampField("critPct", source.critPct),
    critMult: clampField("critMult", source.critMult),
    maxTurns: clampField("maxTurns", source.maxTurns),
  };
}
