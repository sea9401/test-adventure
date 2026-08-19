export type CodexMasteryRepairCliOptions = {
  apply: boolean;
  userId: string | undefined;
};

export type CodexMasteryRepairCliRuntime = {
  listUserIds(options: {
    afterUserId?: string;
    limit: number;
  }): Promise<string[]>;
  repairUser(
    userId: string,
    options: { apply: boolean; now: Date },
  ): Promise<{ changed: boolean; applied: boolean }>;
};

export type CodexMasteryRepairCliDependencies = {
  loadRuntime(): Promise<CodexMasteryRepairCliRuntime>;
  now(): Date;
  log(message: string): void;
  error(message: string): void;
};

export function parseCodexMasteryRepairCliArgs(
  args: readonly string[],
): CodexMasteryRepairCliOptions {
  const apply = args.includes("--apply");
  const dryRun = args.includes("--dry-run");
  if (apply === dryRun) {
    throw new Error("pass exactly one of --dry-run or --apply");
  }

  const userArgs = args.filter((arg) => arg.startsWith("--user="));
  if (userArgs.length > 1) throw new Error("pass --user at most once");
  const userId = userArgs[0]?.slice("--user=".length);
  if (userId !== undefined && userId.length === 0) {
    throw new Error("--user must not be empty");
  }
  if (args.some((arg) =>
    arg !== "--apply" && arg !== "--dry-run" && !arg.startsWith("--user="),
  )) {
    throw new Error("unsupported argument");
  }

  return { apply, userId };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function runCodexMasteryRepairCli(
  options: CodexMasteryRepairCliOptions,
  runtime: CodexMasteryRepairCliRuntime,
  dependencies: Pick<CodexMasteryRepairCliDependencies, "now" | "log" | "error">,
): Promise<number> {
  let changed = 0;
  let applied = 0;
  let errors = 0;

  const repairUser = async (userId: string) => {
    try {
      const result = await runtime.repairUser(userId, {
        apply: options.apply,
        now: dependencies.now(),
      });
      if (result.changed) changed += 1;
      if (result.applied) applied += 1;
    } catch (error) {
      errors += 1;
      dependencies.error(`error user=${userId}: ${errorMessage(error)}`);
    }
  };

  if (options.userId !== undefined) {
    await repairUser(options.userId);
  } else {
    const pageSize = 100;
    let afterUserId: string | undefined;
    while (true) {
      let userIds: string[];
      try {
        userIds = await runtime.listUserIds({ afterUserId, limit: pageSize });
      } catch (error) {
        errors += 1;
        dependencies.error(
          `error cursor=${afterUserId ?? "<start>"}: ${errorMessage(error)}`,
        );
        break;
      }
      if (userIds.length === 0) break;
      for (const userId of userIds) await repairUser(userId);
      afterUserId = userIds.at(-1);
    }
  }

  dependencies.log(`changed=${changed} applied=${applied} errors=${errors}`);
  return errors > 0 ? 1 : 0;
}

export async function executeCodexMasteryRepairCli(
  args: readonly string[],
  dependencies: CodexMasteryRepairCliDependencies,
): Promise<number> {
  const options = parseCodexMasteryRepairCliArgs(args);
  const runtime = await dependencies.loadRuntime();
  return runCodexMasteryRepairCli(options, runtime, dependencies);
}
