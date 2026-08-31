import { CODEX_MASTERY_CATEGORIES, type CodexMasteryCategory } from "@/adventure/data/v2/codexMasteryTypes";
import type { CodexMasteryCatalog } from "@/adventure/data/v2/codexMasteryCatalog";
import { CODEX_MASTERY_CATALOG } from "@/adventure/data/v2/codexMasteryProductionCatalog";
import type { CodexMasteryPinnedGoal } from "@/adventure/data/v2/codexMasteryView";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
  type DbExecutor,
  type DbTransactionExecutor,
} from "./savesKv";

export const CODEX_MASTERY_PINS_KEY = "codex-mastery-pins.v1";
export const CODEX_MASTERY_MAX_PINS = 5;

type PinValidation =
  | { ok: true; entries: CodexMasteryPinnedGoal[] }
  | { ok: false; error: "invalid_pins" | "too_many_pins" | "duplicate_pin" | "unknown_pin" };

function isCategory(value: unknown): value is CodexMasteryCategory {
  return typeof value === "string" &&
    (CODEX_MASTERY_CATEGORIES as readonly string[]).includes(value);
}

function ownPin(value: unknown): CodexMasteryPinnedGoal | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (!Object.hasOwn(value, "category") || !Object.hasOwn(value, "entryId")) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (!isCategory(record.category)) return null;
  if (typeof record.entryId !== "string" || record.entryId.trim().length === 0) {
    return null;
  }
  return { category: record.category, entryId: record.entryId };
}

function pinKey(pin: CodexMasteryPinnedGoal): string {
  return `${pin.category}:${pin.entryId}`;
}

export function parseCodexMasteryPins(
  raw: unknown,
  catalog: CodexMasteryCatalog = CODEX_MASTERY_CATALOG,
): CodexMasteryPinnedGoal[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || !Object.hasOwn(raw, "entries")) {
    return [];
  }
  const values = (raw as { entries?: unknown }).entries;
  if (!Array.isArray(values)) return [];
  const result: CodexMasteryPinnedGoal[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const pin = ownPin(value);
    if (!pin || !catalog.get(pin.category, pin.entryId)) continue;
    const key = pinKey(pin);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(pin);
    if (result.length === CODEX_MASTERY_MAX_PINS) break;
  }
  return result;
}

export function validateCodexMasteryPinRequest(
  raw: unknown,
  catalog: CodexMasteryCatalog = CODEX_MASTERY_CATALOG,
): PinValidation {
  if (!Array.isArray(raw)) return { ok: false, error: "invalid_pins" };
  if (raw.length > CODEX_MASTERY_MAX_PINS) {
    return { ok: false, error: "too_many_pins" };
  }
  const entries: CodexMasteryPinnedGoal[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    const pin = ownPin(value);
    if (!pin) return { ok: false, error: "invalid_pins" };
    if (!catalog.get(pin.category, pin.entryId)) {
      return { ok: false, error: "unknown_pin" };
    }
    const key = pinKey(pin);
    if (seen.has(key)) return { ok: false, error: "duplicate_pin" };
    seen.add(key);
    entries.push(pin);
  }
  return { ok: true, entries };
}

export async function readCodexMasteryPins(
  executor: DbExecutor,
  userId: string,
  catalog: CodexMasteryCatalog = CODEX_MASTERY_CATALOG,
): Promise<CodexMasteryPinnedGoal[]> {
  const raw = await readSave(executor, userId, CODEX_MASTERY_PINS_KEY, { entries: [] });
  return parseCodexMasteryPins(raw, catalog);
}

export async function writeCodexMasteryPins(
  executor: DbTransactionExecutor,
  userId: string,
  entries: readonly CodexMasteryPinnedGoal[],
): Promise<CodexMasteryPinnedGoal[]> {
  const savedEntries = entries.map((entry) => ({ ...entry }));
  await lockSaveForUpdate(executor, userId, CODEX_MASTERY_PINS_KEY, { entries: [] });
  await upsertSave(executor, userId, CODEX_MASTERY_PINS_KEY, { entries: savedEntries });
  return savedEntries;
}
