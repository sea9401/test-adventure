import type { CodexMasteryTrophyRebuildResult } from "./codexMasteryTrophyRebuild";

export type CodexMasteryTrophyRebuildCliOptions = {
  apply: boolean;
  batchSize: number;
  afterUserId: string | undefined;
  userId: string | undefined;
};

export type CodexMasteryTrophyRebuildCliRuntime = {
  listUserIds(options: { afterUserId?: string; limit: number }): Promise<string[]>;
  rebuildUser(
    userId: string,
    options: { apply: boolean; now: Date },
  ): Promise<CodexMasteryTrophyRebuildResult>;
};

export type CodexMasteryTrophyRebuildCliDependencies = {
  loadRuntime(): Promise<CodexMasteryTrophyRebuildCliRuntime>;
  now(): Date;
  log(message: string): void;
  error(message: string): void;
};

function singleValue(args: readonly string[], prefix: string): string | undefined {
  const matches = args.filter((arg) => arg.startsWith(prefix));
  if (matches.length > 1) throw new Error(`pass ${prefix.slice(0, -1)} at most once`);
  const value = matches[0]?.slice(prefix.length);
  if (value !== undefined && value.length === 0) {
    throw new Error(`${prefix.slice(0, -1)} must not be empty`);
  }
  return value;
}

export function parseCodexMasteryTrophyRebuildCliArgs(
  args: readonly string[],
): CodexMasteryTrophyRebuildCliOptions {
  if (args.includes("--apply") && args.includes("--dry-run")) {
    throw new Error("choose only one of --dry-run or --apply");
  }
  const batchText = singleValue(args, "--batch=");
  const batchSize = batchText === undefined ? 100 : Number(batchText);
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 500) {
    throw new Error("--batch must be between 1 and 500");
  }
  const afterUserId = singleValue(args, "--after=");
  const userId = singleValue(args, "--user=");
  if (userId !== undefined && afterUserId !== undefined) {
    throw new Error("--user cannot be combined with --after");
  }
  if (args.some((arg) =>
    arg !== "--apply" &&
    arg !== "--dry-run" &&
    !arg.startsWith("--batch=") &&
    !arg.startsWith("--after=") &&
    !arg.startsWith("--user="),
  )) {
    throw new Error("unsupported argument");
  }
  return {
    apply: args.includes("--apply"),
    batchSize,
    afterUserId,
    userId,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function executeCodexMasteryTrophyRebuildCli(
  args: readonly string[],
  dependencies: CodexMasteryTrophyRebuildCliDependencies,
): Promise<number> {
  const options = parseCodexMasteryTrophyRebuildCliArgs(args);
  const runtime = await dependencies.loadRuntime();
  let userIds: string[];
  try {
    userIds = options.userId
      ? [options.userId]
      : await runtime.listUserIds({
        afterUserId: options.afterUserId,
        limit: options.batchSize,
      });
  } catch (error) {
    dependencies.error(`error cursor=${options.afterUserId ?? "<start>"}: ${errorMessage(error)}`);
    return 1;
  }

  let changedFamilies = 0;
  let promotions = 0;
  let applied = 0;
  let errors = 0;
  for (const userId of userIds) {
    try {
      const result = await runtime.rebuildUser(userId, {
        apply: options.apply,
        now: dependencies.now(),
      });
      changedFamilies += result.changedFamilies;
      promotions += result.promotions;
      if (result.applied) applied += 1;
    } catch (error) {
      errors += 1;
      dependencies.error(`error user=${userId}: ${errorMessage(error)}`);
    }
  }
  const nextCursor = userIds.at(-1) ?? options.afterUserId ?? "<end>";
  dependencies.log(
    `users=${userIds.length} changedFamilies=${changedFamilies} promotions=${promotions} ` +
    `applied=${applied} errors=${errors} nextCursor=${nextCursor}`,
  );
  return errors > 0 ? 1 : 0;
}
