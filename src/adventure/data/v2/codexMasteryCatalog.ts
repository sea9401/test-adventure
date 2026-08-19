import {
  CODEX_MASTERY_CATEGORIES,
  CODEX_MASTERY_POINT_UNITS,
  type CodexMasteryCategory,
  type CodexMasteryEntryDefinition,
} from "./codexMasteryTypes";
import { validateCodexMasteryDefinition } from "./codexMastery";

export type CodexMasteryCatalog = {
  get(
    category: CodexMasteryCategory,
    entryId: string,
  ): CodexMasteryEntryDefinition | null;
  list(category?: CodexMasteryCategory): readonly CodexMasteryEntryDefinition[];
};

function cloneDefinition(
  definition: CodexMasteryEntryDefinition,
): CodexMasteryEntryDefinition {
  const thresholds = Object.freeze({ ...definition.thresholds });
  const seals = Object.freeze(
    Object.fromEntries(
      Object.entries(definition.seals).map(([sealId, seal]) => [
        sealId,
        Object.freeze({ ...seal }),
      ]),
    ),
  ) as CodexMasteryEntryDefinition["seals"];

  return Object.freeze({
    ...definition,
    thresholds,
    seals,
  });
}

function entryKey(category: CodexMasteryCategory, entryId: string): string {
  return `${category}:${entryId}`;
}

const EMPTY_ENTRIES: readonly CodexMasteryEntryDefinition[] = Object.freeze([]);

export function createCodexMasteryCatalog(
  definitions: readonly CodexMasteryEntryDefinition[],
): CodexMasteryCatalog {
  const byKey = new Map<string, CodexMasteryEntryDefinition>();
  const byCategory = new Map<
    CodexMasteryCategory,
    CodexMasteryEntryDefinition[]
  >();
  for (const category of CODEX_MASTERY_CATEGORIES) byCategory.set(category, []);

  for (const definition of definitions) {
    const validationError = validateCodexMasteryDefinition(definition);
    if (validationError) {
      throw new Error(`invalid codex mastery entry: ${validationError}`);
    }

    const key = entryKey(definition.category, definition.entryId);
    if (byKey.has(key)) throw new Error(`duplicate codex mastery entry: ${key}`);

    const clonedDefinition = cloneDefinition(definition);
    byKey.set(key, clonedDefinition);
    byCategory.get(definition.category)?.push(clonedDefinition);
  }

  for (const entries of byCategory.values()) {
    entries.sort((left, right) =>
      left.entryId < right.entryId ? -1 : left.entryId > right.entryId ? 1 : 0,
    );
    Object.freeze(entries);
  }

  const get = (
    category: CodexMasteryCategory,
    entryId: string,
  ): CodexMasteryEntryDefinition | null => byKey.get(entryKey(category, entryId)) ?? null;
  const list = (
    category?: CodexMasteryCategory,
  ): readonly CodexMasteryEntryDefinition[] => {
    if (category !== undefined) return byCategory.get(category) ?? EMPTY_ENTRIES;
    return Object.freeze(
      CODEX_MASTERY_CATEGORIES.flatMap((currentCategory) =>
        byCategory.get(currentCategory) ?? [],
      ),
    );
  };

  return Object.freeze({ get, list });
}

const STANDARD_POINT_UNITS = Object.values(CODEX_MASTERY_POINT_UNITS)
  .reduce((sum, pointUnits) => sum + pointUnits, 0);

export function codexMasteryBudgetReport(
  catalog: CodexMasteryCatalog,
): Record<CodexMasteryCategory, { entries: number; scoreMilli: number }> {
  return Object.fromEntries(
    CODEX_MASTERY_CATEGORIES.map((category) => {
      const entries = catalog.list(category);
      let scoreMilli = 0;
      for (const entry of entries) {
        const entryScoreMilli = STANDARD_POINT_UNITS * entry.scoreWeightMilli;
        if (!Number.isSafeInteger(entryScoreMilli)) {
          throw new Error("codex mastery budget score must be a safe integer");
        }
        scoreMilli += entryScoreMilli;
        if (!Number.isSafeInteger(scoreMilli)) {
          throw new Error("codex mastery budget total must be a safe integer");
        }
      }
      return [
        category,
        {
          entries: entries.length,
          scoreMilli,
        },
      ];
    }),
  ) as Record<CodexMasteryCategory, { entries: number; scoreMilli: number }>;
}
