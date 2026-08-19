#!/usr/bin/env node

import { executeCodexMasteryBackfillCli } from "../src/lib/server/codexMasteryBackfillCli";

executeCodexMasteryBackfillCli(process.argv.slice(2), {
  async loadRuntime() {
    const [{ db }, runner] = await Promise.all([
      import("../src/db"),
      import("../src/lib/server/codexMasteryBackfillRunner"),
    ]);
    return {
      listUserIds: (options) => runner.listCodexMasteryBackfillUserIds(db, options),
      backfillUser: (userId, options) => runner.backfillCodexMasteryUser(db, userId, options),
    };
  },
  now: () => new Date(),
  log: (message) => console.log(message),
  error: (message) => console.error(message),
}).then(
  (exitCode) => { process.exitCode = exitCode; },
  (error: unknown) => { console.error(error); process.exitCode = 1; },
);
