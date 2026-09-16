import { V2_STAT_KEYS, V2_STAT_LABELS } from "./v2StatKeys";
import type { StormExpeditionEncounterKind } from "./stormExpedition";

export const EMBLEM_KINDS = ["hp", "mp", ...V2_STAT_KEYS] as const;
export type EmblemKind = (typeof EMBLEM_KINDS)[number];
export type EmblemGrade = 1 | 2 | 3 | 4 | 5;
export type Emblem = { iid: string; kind: EmblemKind; grade: EmblemGrade };
export type EmblemState = {
  owned: Emblem[];
  slots: (string | null)[];
  revision: number;
};
export type EmblemGrowth = Record<EmblemKind, number>;
export const EMBLEM_SLOT_COUNT = 4;
export const EMBLEM_LABELS: Record<EmblemKind, string> = { hp: "HP", mp: "MP", ...V2_STAT_LABELS };
export const EMBLEM_FUSION_CHANCE: Record<EmblemGrade, number> = { 1: 0.35, 2: 0.20, 3: 0.08, 4: 0.02, 5: 0 };
export const EMBLEM_GROWTH_MAX = {
  hp: [0, 3, 6, 10, 18, 30],
  mp: [0, 2, 4, 7, 11, 18],
  stat: [0, 1, 2, 4, 6, 9],
} as const;
export const EMBLEM_DROP_CHANCE: Record<StormExpeditionEncounterKind, number> = {
  early_trash: 0.05, late_trash: 0.05, elite: 0.15, guardian: 0.15, final_boss: 1,
};

function record(raw: unknown): Record<string, unknown> {
  return raw !== null && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
}
function unit(rng: () => number): number {
  const value = rng();
  return Number.isFinite(value) ? Math.max(0, Math.min(1 - Number.EPSILON, value)) : 0;
}

export function parseEmblemState(raw: unknown): EmblemState {
  const obj = record(raw);
  const owned: Emblem[] = [];
  const seen = new Set<string>();
  for (const value of Array.isArray(obj.owned) ? obj.owned : []) {
    const entry = record(value);
    if (typeof entry.iid !== "string" || !entry.iid || entry.iid.length > 100 || seen.has(entry.iid)) continue;
    if (!(EMBLEM_KINDS as readonly unknown[]).includes(entry.kind)) continue;
    if (typeof entry.grade !== "number" || !Number.isInteger(entry.grade) || entry.grade < 1 || entry.grade > 5) continue;
    owned.push({ iid: entry.iid, kind: entry.kind as EmblemKind, grade: entry.grade as EmblemGrade });
    seen.add(entry.iid);
  }
  const equipped = new Set<string>();
  const rawSlots = Array.isArray(obj.slots) ? obj.slots : [];
  const slots = Array.from({ length: EMBLEM_SLOT_COUNT }, (_, index) => {
    const iid = rawSlots[index];
    if (typeof iid !== "string" || !seen.has(iid) || equipped.has(iid)) return null;
    equipped.add(iid);
    return iid;
  });
  return { owned, slots, revision: typeof obj.revision === "number" && Number.isSafeInteger(obj.revision) && obj.revision >= 0 ? obj.revision : 0 };
}

export type EmblemMutation = {
  action?: unknown;
  iid?: unknown;
  slot?: unknown;
  materialIid?: unknown;
  expectedRevision?: unknown;
};

/** Caller must hold the character lock. All failures leave the input unchanged. */
export function mutateEmblems(
  state: EmblemState,
  input: EmblemMutation,
  rng: () => number = Math.random,
): { state: EmblemState; success?: boolean } {
  if (input.expectedRevision !== state.revision) throw new Error("stale_state");
  const next: EmblemState = { owned: [...state.owned], slots: [...state.slots], revision: state.revision + 1 };
  if (input.action === "equip" || input.action === "unequip") {
    if (typeof input.slot !== "number" || !Number.isInteger(input.slot) || input.slot < 0 || input.slot >= EMBLEM_SLOT_COUNT) throw new Error("invalid_slot");
    if (input.action === "unequip") {
      next.slots[input.slot] = null;
    } else {
      const target = state.owned.find((entry) => entry.iid === input.iid);
      if (!target) throw new Error("not_owned");
      next.slots = next.slots.map((iid) => iid === target.iid ? null : iid);
      next.slots[input.slot] = target.iid;
    }
    return { state: next };
  }
  if (input.action !== "fuse") throw new Error("invalid_action");
  const target = state.owned.find((entry) => entry.iid === input.iid);
  if (!target) throw new Error("not_owned");
  if (target.grade === 5) throw new Error("max_grade");
  const material = state.owned.find((entry) => entry.iid === input.materialIid);
  if (!material || material.iid === target.iid || material.kind !== target.kind || material.grade !== target.grade) throw new Error("invalid_material");
  if (state.slots.includes(material.iid)) throw new Error("material_equipped");
  const success = unit(rng) < EMBLEM_FUSION_CHANCE[target.grade];
  next.owned = state.owned.filter((entry) => entry.iid !== material.iid).map((entry) =>
    success && entry.iid === target.iid ? { ...entry, grade: (entry.grade + 1) as EmblemGrade } : entry,
  );
  return { state: next, success };
}

export function emblemGrowthMax(emblem: Pick<Emblem, "kind" | "grade">): number {
  return EMBLEM_GROWTH_MAX[emblem.kind === "hp" || emblem.kind === "mp" ? emblem.kind : "stat"][emblem.grade];
}

export function emptyEmblemGrowth(): EmblemGrowth {
  return { hp: 0, mp: 0, str: 0, dex: 0, vit: 0, int: 0, spi: 0, luk: 0 };
}

/** Independent inclusive roll for each equipped instance for each newly gained level. */
export function rollEmblemGrowth(state: EmblemState, levelsGained: number, rng: () => number = Math.random): EmblemGrowth {
  const growth = emptyEmblemGrowth();
  if (!Number.isFinite(levelsGained) || levelsGained <= 0) return growth;
  const equipped = state.slots.map((iid) => state.owned.find((entry) => entry.iid === iid)).filter((entry): entry is Emblem => !!entry);
  for (let level = 0; level < Math.floor(levelsGained); level++) {
    for (const emblem of equipped) {
      growth[emblem.kind] += Math.floor(unit(rng) * (emblemGrowthMax(emblem) + 1));
    }
  }
  return growth;
}

/** Drop chance first, then independent grade (89/10/1%) and kind (12.5% each). */
export function rollEmblemDrop(kind: StormExpeditionEncounterKind, iid: string, rng: () => number = Math.random): Emblem | null {
  if (kind !== "final_boss" && unit(rng) >= EMBLEM_DROP_CHANCE[kind]) return null;
  const gradeRoll = unit(rng);
  const grade: EmblemGrade = gradeRoll < 0.89 ? 1 : gradeRoll < 0.99 ? 2 : 3;
  return { iid, grade, kind: EMBLEM_KINDS[Math.floor(unit(rng) * EMBLEM_KINDS.length)] };
}
