// 길드·협회 식당 효과로 붙은 경험치 표시 — 생활 요청 응답의 diningXpBonus 를 결과 화면용으로 읽는다.
// 활동 한 번의 기본 경험치가 작아 효과분이 +0~+1 로 섞여 보이지 않던 것을 따로 적는다(건의 #882).

export type DiningXpBonus = { menuName: string; xp: number };

export function parseDiningXpBonus(response: unknown): DiningXpBonus | null {
  const raw = (response as { diningXpBonus?: unknown } | null)?.diningXpBonus;
  if (!raw || typeof raw !== "object") return null;
  const { menuName, xp } = raw as { menuName?: unknown; xp?: unknown };
  if (typeof menuName !== "string" || !menuName) return null;
  return { menuName, xp: Math.max(0, Math.floor(Number(xp) || 0)) };
}

export function addDiningXpBonus(
  total: DiningXpBonus | null,
  gain: DiningXpBonus | null,
): DiningXpBonus | null {
  if (!gain) return total;
  if (!total) return gain;
  return { menuName: gain.menuName, xp: total.xp + gain.xp };
}

/** 1 미만은 서버가 모아 두었다가 다음 획득에 더하므로, 이번에 붙은 값이 0일 수 있다. */
export function diningXpBonusText(bonus: DiningXpBonus | null | undefined): string {
  if (!bonus) return "";
  return bonus.xp > 0
    ? `${bonus.menuName} +${bonus.xp.toLocaleString("ko-KR")}`
    : `${bonus.menuName} +0, 1 미만은 다음 획득에 합산`;
}

/** "채광 XP +6" 같은 수치 바로 뒤에 붙이는 괄호 문구. */
export function diningXpBonusSuffix(bonus: DiningXpBonus | null | undefined): string {
  const text = diningXpBonusText(bonus);
  return text ? ` (${text})` : "";
}
