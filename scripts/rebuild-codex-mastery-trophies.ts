#!/usr/bin/env node

import { CODEX_MASTERY_CATALOG } from "../src/adventure/data/v2/codexMasteryProductionCatalog";
import { executeCodexMasteryTrophyRebuildCli } from "../src/lib/server/codexMasteryTrophyRebuildCli";

executeCodexMasteryTrophyRebuildCli(process.argv.slice(2), {
  async loadRuntime() {
    const [{ db }, rebuild] = await Promise.all([
      import("../src/db"),
      import("../src/lib/server/codexMasteryTrophyRebuild"),
    ]);
    return {
      listUserIds: (options) => rebuild.listCodexMasteryTrophyUserIds(db, options),
      rebuildUser: (userId, options) =>
        rebuild.rebuildCodexMasteryTrophiesWithDatabase(
          db,
          userId,
          CODEX_MASTERY_CATALOG,
          options,
        ),
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
