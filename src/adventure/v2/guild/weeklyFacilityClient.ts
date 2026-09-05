export function weeklyFacilityActionLimit(
  eligible: boolean | undefined,
  limit: number,
): number {
  if (eligible === false) return 0;
  return Math.max(0, Math.floor(Number(limit) || 0));
}

export function weeklyFacilityConflictNotice(facilityName: string): string {
  return `이번 주에는 이전에 선택한 길드의 ${facilityName}만 이용할 수 있습니다. 다음 주 월요일 00:00 KST부터 현재 길드 ${facilityName}을 이용할 수 있습니다.`;
}
