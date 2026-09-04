import { pathToFileURL } from "node:url";
import { runFixedUnexploredRewardSimulation } from "../src/adventure/data/v2/unexploredRewardSimulation";

function numericArg(name: string, fallback: number): number {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function format(value: number): string {
  return value.toLocaleString("ko-KR", { maximumFractionDigits: 1 });
}

export function main(): void {
  const seed = numericArg("--seed", 20_260_828);
  const runs = numericArg("--runs", 10_000);
  const report = runFixedUnexploredRewardSimulation({ seed, runs });
  let failed = false;

  console.log(`미개척지 보상 경제 시뮬레이션 · seed ${seed} · 캐릭터당 ${runs}회`);
  console.log(
    `비교 기준 사냥터 · 스태미나 100당 순가치 ${format(report.benchmarkPer100StaminaNet)}G = 100%`,
  );
  console.log("구성 | 난이도 | 안정 표본 | 100당 순가치 | 시간당 순가치 | 기준 대비 | 목표");
  for (const row of report.rows) {
    const target = row.targetPct == null ? "관찰" : `${row.targetPct}% ±5%p`;
    const inRange =
      row.targetPct == null ||
      (row.rewardIndexPct >= row.targetPct - 5 &&
        row.rewardIndexPct <= row.targetPct + 5);
    if (!inRange) failed = true;
    console.log(
      [
        row.label,
        row.difficulty,
        `${row.stablePlayerCount}명${row.excludedPlayerCount > 0 ? `(-${row.excludedPlayerCount})` : ""}`,
        `${format(row.per100StaminaNet)}G`,
        `${format(row.perHourNet)}G`,
        `${format(row.rewardIndexPct)}%`,
        `${target}${inRange ? "" : " [이탈]"}`,
      ].join(" | "),
    );
  }

  const maxInRange =
    report.maxRewardIndexPct >= 170 && report.maxRewardIndexPct <= 185;
  if (!maxInRange) failed = true;
  console.log(
    `최대 보상 구성 ${format(report.maxRewardIndexPct)}% · 허용 170~185%${maxInRange ? "" : " [이탈]"}`,
  );
  console.log(`가치 제외 · ${report.valuationExcludes.join(" · ")}`);
  if (failed) process.exitCode = 1;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : null;
if (invokedPath === import.meta.url) main();
