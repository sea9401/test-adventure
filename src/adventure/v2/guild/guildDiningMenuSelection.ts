import type { GuildDiningMenuId } from "@/adventure/data/v2/guildDining";

export function guildDiningMenuLockNotice({
  pantryPoints,
  level,
  menuSlots,
  selectedCount,
}: {
  pantryPoints: number;
  level: number;
  menuSlots: number;
  selectedCount: number;
}): string | null {
  if (pantryPoints <= 0) return null;
  if (selectedCount < menuSlots) {
    return `식당이 Lv.${level}로 성장했지만 이번 주 메뉴는 이미 ${selectedCount}종으로 확정되었습니다. 다음 주 월요일 00:00부터 메뉴 ${menuSlots}종을 선택할 수 있습니다.`;
  }
  return "식재료 기부가 시작되어 이번 주 메뉴가 확정되었습니다. 메뉴는 다음 주 월요일 00:00에 다시 선택할 수 있습니다.";
}

export function toggleGuildDiningMenuSelection(
  current: GuildDiningMenuId[],
  menuId: GuildDiningMenuId,
  menuSlots: number,
): GuildDiningMenuId[] {
  if (current.includes(menuId)) {
    return current.length > 1
      ? current.filter((id) => id !== menuId)
      : current;
  }
  if (menuSlots === 1) return [menuId];
  if (current.length >= menuSlots) return current;
  return [...current, menuId];
}
