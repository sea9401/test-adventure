import type { CodexMasteryBackfillRunResult } from "./codexMasteryBackfillRunner";

export type CodexMasteryBackfillCliOptions = { apply: boolean; userId: string | undefined };
export type CodexMasteryBackfillCliRuntime = {
  listUserIds(options: { afterUserId?: string; limit: number }): Promise<string[]>;
  backfillUser(userId: string, options: { apply: boolean; now: Date }): Promise<CodexMasteryBackfillRunResult>;
};
export type CodexMasteryBackfillCliDependencies = {
  loadRuntime(): Promise<CodexMasteryBackfillCliRuntime>;
  now(): Date;
  log(message: string): void;
  error(message: string): void;
};

export function parseCodexMasteryBackfillCliArgs(args: readonly string[]): CodexMasteryBackfillCliOptions {
  const apply = args.includes("--apply");
  const dryRun = args.includes("--dry-run");
  if (apply === dryRun) throw new Error("pass exactly one of --dry-run or --apply");
  const users = args.filter((arg) => arg.startsWith("--user="));
  if (users.length > 1) throw new Error("pass --user at most once");
  const userId = users[0]?.slice(7);
  if (userId !== undefined && userId.length === 0) throw new Error("--user must not be empty");
  if (args.some((arg) => arg !== "--apply" && arg !== "--dry-run" && !arg.startsWith("--user="))) {
    throw new Error("unsupported argument");
  }
  return { apply, userId };
}

export async function executeCodexMasteryBackfillCli(
  args: readonly string[],
  dependencies: CodexMasteryBackfillCliDependencies,
): Promise<number> {
  const options = parseCodexMasteryBackfillCliArgs(args);
  const runtime = await dependencies.loadRuntime();
  let users = 0, skipped = 0, targets = 0, changed = 0, scoreDeltaMilli = 0, applied = 0, errors = 0;
  const run = async (userId: string) => {
    users += 1;
    try {
      const result = await runtime.backfillUser(userId, { apply: options.apply, now: dependencies.now() });
      skipped += result.skipped ? 1 : 0;
      targets += result.targets;
      changed += result.changedEntries;
      scoreDeltaMilli += result.scoreDeltaMilli;
      applied += result.applied ? 1 : 0;
    } catch (error) {
      errors += 1;
      dependencies.error(`error user=${userId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  if (options.userId) {
    await run(options.userId);
  } else {
    let afterUserId: string | undefined;
    while (true) {
      let page: string[];
      try {
        page = await runtime.listUserIds({ afterUserId, limit: 100 });
      } catch (error) {
        errors += 1;
        dependencies.error(`error cursor=${afterUserId ?? "<start>"}: ${error instanceof Error ? error.message : String(error)}`);
        break;
      }
      if (page.length === 0) break;
      for (const userId of page) await run(userId);
      afterUserId = page.at(-1);
    }
  }
  dependencies.log(`users=${users} skipped=${skipped} targets=${targets} changed=${changed} scoreDeltaMilli=${scoreDeltaMilli} applied=${applied} errors=${errors}`);
  return errors > 0 ? 1 : 0;
}
