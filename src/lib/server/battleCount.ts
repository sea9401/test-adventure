// 누적 전투 횟수(전적) 산식의 단일 정의 — adventure-log.v2 의 monster kills 합 + 패배수.
// 신참 보너스 게이트(hunt)·전적 표기(me/state·player/[name])·랭킹 battleCount(SQL 미러,
// rankings/route.ts·admin/stats)가 모두 이 정의를 따른다 — 정의가 갈라지면 신참 보너스
// 오지급/전적 불일치로 직결되므로 TS 쪽은 여기 한 곳만 수정할 것.
export function battleCountOf(adventureLogRaw: unknown): number {
  const logVal = (adventureLogRaw ?? null) as {
    monsters?: Record<string, { kills?: number }>;
    battleLosses?: number;
  } | null;
  return (
    Object.values(logVal?.monsters ?? {}).reduce(
      (sum, m) => sum + (m?.kills ?? 0),
      0,
    ) + (logVal?.battleLosses ?? 0)
  );
}
