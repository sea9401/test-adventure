import { kstWeekMondayKey } from "@/lib/kst";

export const GUILD_WEEKLY_SUPPLIES_BUFF_ID = "weekly_member_supplies";
export const GUILD_WEEKLY_SUPPLIES_COST = 30_000_000;
export const GUILD_WEEKLY_SUPPLIES_POTIONS = 3;

type GuildSlot = { buffId: string; tier: number; installedAt: string };

function guildSlots(raw: unknown): GuildSlot[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((slot): slot is GuildSlot =>
    slot != null && typeof slot === "object" &&
    typeof slot.buffId === "string" &&
    typeof slot.tier === "number" &&
    typeof slot.installedAt === "string",
  );
}

export function guildWeeklySuppliesFunded(raw: unknown, now: Date): boolean {
  const weekKey = kstWeekMondayKey(now);
  return guildSlots(raw).some((slot) => {
    if (slot.buffId !== GUILD_WEEKLY_SUPPLIES_BUFF_ID) return false;
    const installed = new Date(slot.installedAt);
    return Number.isFinite(installed.getTime()) && kstWeekMondayKey(installed) === weekKey;
  });
}

export function markGuildWeeklySuppliesFunded(raw: unknown, now: Date): GuildSlot[] {
  const other = guildSlots(raw).filter((slot) => slot.buffId !== GUILD_WEEKLY_SUPPLIES_BUFF_ID);
  return [...other, { buffId: GUILD_WEEKLY_SUPPLIES_BUFF_ID, tier: 1, installedAt: now.toISOString() }];
}
