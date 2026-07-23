import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// 이미 운영에서 후속 복구까지 끝난 역사적 예외다. 시간값을 지금 고치면 Drizzle이
// 0094/0095를 다시 실행하려 할 수 있으므로 그대로 고정하고, 새로운 역전만 차단한다.
const LEGACY_ORDER_EXCEPTIONS = new Map([
  [
    "0012_guild_quests_all_active",
    { when: 1_747_000_000_000, maxBeforeTag: "0011_little_switch" },
  ],
  [
    "0037_skinny_the_fallen",
    { when: 1_779_772_109_133, maxBeforeTag: "0036_drop_alliance_policy" },
  ],
  [
    "0094_settlement_buildings",
    { when: 1_782_691_200_000, maxBeforeTag: "0093_feedback_reports" },
  ],
  [
    "0095_guild_workshop_weekly",
    { when: 1_782_734_400_000, maxBeforeTag: "0093_feedback_reports" },
  ],
]);

export function validateMigrationJournal(journal) {
  if (!journal || !Array.isArray(journal.entries)) {
    return ["drizzle/meta/_journal.json entries가 배열이 아닙니다"];
  }

  const errors = [];
  const usedLegacyExceptions = new Set();
  let maxWhen = Number.NEGATIVE_INFINITY;
  let maxWhenTag = "";

  for (const [position, entry] of journal.entries.entries()) {
    if (entry.idx !== position) {
      errors.push(`${entry.tag ?? position}: idx ${entry.idx} (expected ${position})`);
    }
    if (typeof entry.tag !== "string" || !/^\d{4}_.+/.test(entry.tag)) {
      errors.push(`${position}: invalid migration tag`);
      continue;
    }
    if (!Number.isSafeInteger(entry.when)) {
      errors.push(`${entry.tag}: invalid when ${entry.when}`);
      continue;
    }

    if (entry.when <= maxWhen) {
      const legacy = LEGACY_ORDER_EXCEPTIONS.get(entry.tag);
      if (
        !legacy ||
        legacy.when !== entry.when ||
        legacy.maxBeforeTag !== maxWhenTag
      ) {
        errors.push(
          `${entry.tag}: when ${entry.when} must be greater than ${maxWhen} (${maxWhenTag})`,
        );
      } else {
        usedLegacyExceptions.add(entry.tag);
      }
      continue;
    }

    maxWhen = entry.when;
    maxWhenTag = entry.tag;
  }

  for (const tag of LEGACY_ORDER_EXCEPTIONS.keys()) {
    if (!usedLegacyExceptions.has(tag)) {
      errors.push(`${tag}: expected legacy ordering exception was changed`);
    }
  }

  return errors;
}

export function validateMigrationFiles(journal, fileNames) {
  if (!journal || !Array.isArray(journal.entries)) return [];
  const expected = journal.entries.map((entry) => `${entry.tag}.sql`).sort();
  const actual = fileNames.filter((name) => name.endsWith(".sql")).sort();
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);

  return [
    ...expected.filter((name) => !actualSet.has(name)).map((name) => `missing ${name}`),
    ...actual.filter((name) => !expectedSet.has(name)).map((name) => `untracked ${name}`),
  ];
}

async function main() {
  const journalPath = resolve("drizzle/meta/_journal.json");
  const journal = JSON.parse(await readFile(journalPath, "utf8"));
  const migrationFiles = await readdir(resolve("drizzle"));
  const errors = [
    ...validateMigrationJournal(journal),
    ...validateMigrationFiles(journal, migrationFiles),
  ];

  if (errors.length > 0) {
    console.error("✗ migration journal validation failed");
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }

  console.log(`✓ migration journal valid (${journal.entries.length} migrations)`);
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main();
}
