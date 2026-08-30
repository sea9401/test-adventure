import { simulateEquipmentLiberation } from "../src/adventure/data/v2/equipmentLiberationSimulation.ts";

function numericArgument(name, fallback) {
  const prefix = `--${name}=`;
  const token = process.argv.slice(2).find((value) => value.startsWith(prefix));
  if (!token) return fallback;
  const parsed = Number(token.slice(prefix.length));
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name}은(는) 숫자여야 합니다.`);
  }
  return parsed;
}

const seed = numericArgument("seed", 20_260_829);
const iterations = numericArgument("iterations", 100_000);
const summary = simulateEquipmentLiberation({ seed, iterations });

console.log(`장비 해방 시뮬레이션 · seed ${summary.seed} · ${summary.iterations.toLocaleString("ko-KR")}회/부위`);
console.log(`허용 오차: 이항분포 표준오차 × ${summary.sigmaTolerance}`);

console.table(
  Object.entries(summary.initialLineCounts).map(([lineCount, row]) => ({
    구분: `${lineCount}줄`,
    관측: `${row.observedPct}%`,
    이론: `${row.theoreticalPct}%`,
    허용오차: `±${row.tolerancePct}%p`,
    판정: row.passed ? "통과" : "초과",
  })),
);

console.table([
  {
    구분: "해방 3→2",
    관측: `${summary.promotions.rank3To2.observedPct}%`,
    이론: `${summary.promotions.rank3To2.theoreticalPct}%`,
    평균시도: summary.promotions.averageAttemptsRank3To2,
  },
  {
    구분: "해방 2→1",
    관측: `${summary.promotions.rank2To1.observedPct}%`,
    이론: `${summary.promotions.rank2To1.theoreticalPct}%`,
    평균시도: summary.promotions.averageAttemptsRank2To1,
  },
]);
console.log(
  `최초 해방부터 해방 1까지 평균 골드: ${summary.promotions.averageGoldToRank1.toLocaleString("ko-KR")}`,
);

console.table(
  summary.combat.map((row) => ({
    직업: row.jobName,
    유형: row.archetype,
    "평균 해방3 피해": row.settings.averageRank3.primaryDamageIndex,
    "평균 해방2 피해": row.settings.averageRank2.primaryDamageIndex,
    "상위 해방1 피해": row.settings.topRank1.primaryDamageIndex,
    "상위 해방1 물리EHP": row.settings.topRank1.physicalEhpIndex,
    "상위 해방1 마법EHP": row.settings.topRank1.magicEhpIndex,
  })),
);

if (summary.validation.warnings.length === 0) {
  console.log("검증 경고: 0개");
} else {
  console.error(`검증 경고: ${summary.validation.warnings.length}개`);
  for (const warning of summary.validation.warnings) console.error(`- ${warning}`);
}

console.log("EQUIPMENT_LIBERATION_JSON_START");
console.log(JSON.stringify(summary));
console.log("EQUIPMENT_LIBERATION_JSON_END");

if (summary.validation.warnings.length > 0) process.exitCode = 1;
