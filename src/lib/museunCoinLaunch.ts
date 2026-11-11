const LAUNCH_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD` 결제 시작일을 약관 표기로 바꾼다. 비었거나 실제 날짜가 아니면 null. */
export function formatMuseunCoinLaunchDate(value: string | undefined): string | null {
  const match = LAUNCH_DATE_PATTERN.exec(value?.trim() ?? "");
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}년 ${month}월 ${day}일`;
}
