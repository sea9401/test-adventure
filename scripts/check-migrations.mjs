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

// 이 태그까지의 파괴적 SQL은 이미 운영 반영된 역사다. 이후 마이그레이션은
// 코드 리뷰에서 눈에 띄는 승인 사유가 있어야 DROP/TRUNCATE를 허용한다.
const DESTRUCTIVE_MIGRATION_BASELINE_TAG = "0164_ambiguous_barracuda";

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

function executableSql(sql) {
  let output = "";
  for (let index = 0; index < sql.length; ) {
    if (sql.startsWith("--", index)) {
      const newline = sql.indexOf("\n", index + 2);
      if (newline < 0) break;
      output += "\n";
      index = newline + 1;
      continue;
    }
    if (sql.startsWith("/*", index)) {
      const end = sql.indexOf("*/", index + 2);
      index = end < 0 ? sql.length : end + 2;
      output += " ";
      continue;
    }
    if (sql[index] === "'") {
      index += 1;
      while (index < sql.length) {
        if (sql[index] !== "'") {
          index += 1;
          continue;
        }
        if (sql[index + 1] === "'") {
          index += 2;
          continue;
        }
        index += 1;
        break;
      }
      output += " '' ";
      continue;
    }
    if (sql[index] === "$") {
      const delimiter = sql.slice(index).match(/^\$[A-Za-z_0-9]*\$/)?.[0];
      if (delimiter) {
        const end = sql.indexOf(delimiter, index + delimiter.length);
        if (end >= 0) {
          index = end + delimiter.length;
          output += " $$ ";
          continue;
        }
      }
    }
    output += sql[index];
    index += 1;
  }
  return output;
}

function destructiveApprovalReason(sql) {
  const match = sql.match(
    /^\s*--\s*ops:\s*allow-destructive\s+reason=(.+)$/im,
  );
  return match?.[1]?.trim() ?? "";
}

export function validateDangerousMigrations(journal, sqlByFile) {
  if (!journal || !Array.isArray(journal.entries)) return [];
  const baselineIndex = journal.entries.findIndex(
    (entry) => entry.tag === DESTRUCTIVE_MIGRATION_BASELINE_TAG,
  );
  if (baselineIndex < 0) {
    return [
      `${DESTRUCTIVE_MIGRATION_BASELINE_TAG}: destructive migration baseline is missing`,
    ];
  }

  const errors = [];
  for (const entry of journal.entries.slice(baselineIndex + 1)) {
    const fileName = `${entry.tag}.sql`;
    const sql = sqlByFile[fileName];
    if (typeof sql !== "string") continue;
    const executable = executableSql(sql);
    if (!/\b(?:DROP\s+TABLE|DROP\s+COLUMN|TRUNCATE(?:\s+TABLE)?)\b/i.test(executable)) {
      continue;
    }
    const reason = destructiveApprovalReason(sql);
    if (reason.length < 12) {
      errors.push(
        `${entry.tag}: destructive SQL requires "-- ops: allow-destructive reason=<12자 이상 사유>" and a verified pre-deploy backup`,
      );
    }
  }
  return errors;
}

async function main() {
  const journalPath = resolve("drizzle/meta/_journal.json");
  const journal = JSON.parse(await readFile(journalPath, "utf8"));
  const migrationFiles = await readdir(resolve("drizzle"));
  const sqlByFile = Object.fromEntries(
    await Promise.all(
      migrationFiles
        .filter((fileName) => fileName.endsWith(".sql"))
        .map(async (fileName) => [
          fileName,
          await readFile(resolve("drizzle", fileName), "utf8"),
        ]),
    ),
  );
  const errors = [
    ...validateMigrationJournal(journal),
    ...validateMigrationFiles(journal, migrationFiles),
    ...validateDangerousMigrations(journal, sqlByFile),
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
