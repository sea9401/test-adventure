import type { GuildDiningMenuId } from "@/adventure/data/v2/guildDining";

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
