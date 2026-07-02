// KST(UTC+9) 달력 키 — 일일/주간 리셋 경계의 단일 소스.
// 그동안 v2RepeatQuests·tower/weeklyTypes·pvp/coins 가 같은 로직을 각자 구현했다(2026-07 통합).
// KST 는 DST 가 없어 고정 오프셋 산술이 안전하다.
//
// ⚠️ 키 문자열("YYYY-MM-DD")은 세이브/DB 에 저장돼 비교된다 — 출력이 1글자라도 바뀌면
// 라이브 일일/주간 진행이 리셋된다. kst.test.ts 가 옛 구현을 오라클로 값을 고정한다.
export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** KST 달력 날짜 키 "YYYY-MM-DD" — 일일 리셋 경계(KST 자정). */
export function kstDayKey(now: Date = new Date()): string {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 이번 주 시작(월요일 00:00 KST)의 KST 날짜 키 "YYYY-MM-DD" — 주간 리셋 경계. */
export function kstWeekMondayKey(now: Date = new Date()): string {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const daysSinceMonday = (kst.getUTCDay() + 6) % 7;
  kst.setUTCDate(kst.getUTCDate() - daysSinceMonday);
  return kst.toISOString().slice(0, 10);
}
