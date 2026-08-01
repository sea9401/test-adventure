// v2 성장 페이싱 요약 — 운영 환경의 실제 EXP·에너지·직업 숙련·장비 드랍 값을 사용한다.
//
// 과거 버전은 최대 에너지 5,000, 시간당 120 회복, 레벨 기반 옛 던전 층을 하드코딩해 현재
// 라이브와 다른 결과를 냈다. 계산은 통합 점검기와 한 소스를 공유해 설정 변경 시 함께 갱신한다.
//
// 실행: npm run sim:exp-pacing

import { buildGrowthPacing } from "./sim-v2-level-design";

function expected(value: number | null): string {
  return value == null ? "-" : Math.round(value).toLocaleString("ko-KR");
}

const growth = buildGrowthPacing();
const { energy, career } = growth;

console.log("v2 운영 성장 페이싱");
console.log(
  `Lv1→100 필요 EXP ${growth.totalExpToLevelCap.toLocaleString("ko-KR")} · 기본 에너지 ${energy.baseMax.toLocaleString("ko-KR")} / ${energy.baseFullHours.toFixed(1)}시간 만충 / 자연회복 ${energy.baseNaturalPerDay.toLocaleString("ko-KR")}회·일`,
);
console.log(
  `일 1회 접속 회수율: 기본 ${energy.baseDailyLoginCapturePct.toFixed(1)}% · 지원권 ${energy.supportDailyLoginCapturePct.toFixed(1)}% · 신규 HP/MP 충전 각 ${energy.starterChargeEach.toLocaleString("ko-KR")}`,
);
console.log(
  `단일 계보 6차: ${career.totalWinsToTier6Path.toLocaleString("ko-KR")}승 · 자연회복 하한 ${career.idealDaysToTier6Path.toFixed(1)}일 · 일 1회 기본 ${career.dailyLoginDaysToTier6Path.toFixed(1)}일 · 지원권 ${career.supportDailyLoginDaysToTier6Path.toFixed(1)}일`,
);
if (growth.largestExpJump) {
  console.log(
    `대표 단계 최대 EXP 상승: 깊이 ${growth.largestExpJump.fromDepth}→${growth.largestExpJump.toDepth} ×${growth.largestExpJump.multiplier.toFixed(1)}`,
  );
}

console.log("\n깊이 | 단계 | EXP/승 | Lv100 승리(신참/베테랑) | 베테랑 일수(회복/일1회) | 일반 기대(아무/특정) | 고유 기대(아무/특정)");
for (const row of growth.rows) {
  console.log(
    [
      row.depth.toString().padStart(2),
      row.name,
      row.avgVeteranExpPerWin.toFixed(1),
      `${row.newbieLevelCapWins.toLocaleString("ko-KR")}/${row.veteranLevelCapWins.toLocaleString("ko-KR")}`,
      `${row.veteranIdealDays.toFixed(2)}/${row.veteranDailyLoginDays.toFixed(2)}일`,
      `${expected(row.commonAnyExpectedWins)}/${expected(row.commonSpecificExpectedWins)}`,
      `${expected(row.signatureAnyExpectedWins)}/${expected(row.signatureSpecificExpectedWins)}`,
    ].join(" | "),
  );
}
