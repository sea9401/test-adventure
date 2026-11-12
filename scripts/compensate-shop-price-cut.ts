#!/usr/bin/env node

// 2026-11-12 무슨 코인 상점 가격 인하 차액 보상. 가격 인하 배포 뒤에 한 번 실행한다.
//   npm run coin:compensate-price-cut -- --dry-run
//   npm run coin:compensate-price-cut -- --apply [--exclude-ledger=<원장 id>]
// 여러 번 실행해도 한 구매는 한 번만 보상된다.

import { executePriceCutCompensationCli } from "../src/lib/server/museunCoinPriceCutCompensation";

executePriceCutCompensationCli(process.argv.slice(2), {
  async loadRuntime() {
    const [{ db }, runner] = await Promise.all([
      import("../src/db"),
      import("../src/lib/server/museunCoinPriceCutCompensationRunner"),
    ]);
    return runner.createPriceCutCompensationRuntime(db);
  },
  log: (message) => console.log(message),
  error: (message) => console.error(message),
}).then(
  (exitCode) => { process.exitCode = exitCode; },
  (error: unknown) => { console.error(error); process.exitCode = 1; },
);
