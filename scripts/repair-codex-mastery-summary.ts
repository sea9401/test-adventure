#!/usr/bin/env node

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const dryRun = args.includes("--dry-run");

if (apply === dryRun) {
  throw new Error("pass exactly one of --dry-run or --apply");
}

const userArgs = args.filter((arg) => arg.startsWith("--user="));
if (userArgs.length > 1) {
  throw new Error("pass --user at most once");
}
const userId = userArgs[0]?.slice("--user=".length);
if (userId !== undefined && userId.length === 0) {
  throw new Error("--user must not be empty");
}
if (args.some((arg) => arg !== "--apply" && arg !== "--dry-run" && !arg.startsWith("--user="))) {
  throw new Error("unsupported argument");
}

async function main(): Promise<number> {
  // Keep the runtime database import after the mode guard: an omitted/ambiguous mode must
  // fail without even constructing the lazy application database proxy.
  const [{ db }, repair] = await Promise.all([
    import("../src/db"),
    import("../src/lib/server/codexMasteryRepair"),
  ]);
  const store = repair.createDrizzleCodexMasteryRepairStore(db);
  let changed = 0;
  let applied = 0;
  let errors = 0;

  const repairUser = async (targetUserId: string) => {
    try {
      const result = await repair.repairCodexMasterySummary(store, targetUserId, {
        apply,
        now: new Date(),
      });
      if (result.changed) changed += 1;
      if (result.applied) applied += 1;
    } catch (error) {
      errors += 1;
      console.error(`error user=${targetUserId}`, error);
    }
  };

  if (userId) {
    await repairUser(userId);
  } else {
    const pageSize = 100;
    let afterUserId: string | undefined;
    do {
      const userIds = await repair.listCodexMasterySummaryUserIds(db, {
        afterUserId,
        limit: pageSize,
      });
      for (const listedUserId of userIds) await repairUser(listedUserId);
      afterUserId = userIds.at(-1);
    } while (afterUserId !== undefined);
  }

  console.log(`changed=${changed} applied=${applied} errors=${errors}`);
  return errors > 0 ? 1 : 0;
}

main().then(
  (exitCode) => {
    process.exitCode = exitCode;
  },
  (error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  },
);
