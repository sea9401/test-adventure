#!/usr/bin/env node

import { executeCodexMasteryRepairCli } from "../src/lib/server/codexMasteryRepairCli";

executeCodexMasteryRepairCli(process.argv.slice(2), {
  async loadRuntime() {
    // Argument validation runs before this loader, so invalid mode never imports the DB.
    const [{ db }, repair] = await Promise.all([
      import("../src/db"),
      import("../src/lib/server/codexMasteryRepair"),
    ]);
    return {
      listUserIds: (options) => repair.listCodexMasterySummaryUserIds(db, options),
      repairUser: (userId, options) =>
        repair.repairCodexMasterySummaryWithDatabase(db, userId, options),
    };
  },
  now: () => new Date(),
  log: (message) => console.log(message),
  error: (message) => console.error(message),
}).then(
  (exitCode) => {
    process.exitCode = exitCode;
  },
  (error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  },
);
