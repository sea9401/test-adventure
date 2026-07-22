import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import {
  museunCosmeticAppearance,
  type MuseunCosmeticAppearance,
} from "@/adventure/data/v2/museunCosmetics";
import { readProfileValue } from "@/adventure/profile/profileValue";
import type { Avatar } from "@/adventure/profile/avatars";

type CharacterCosmeticsSave = {
  museunCosmetics?: unknown;
  arenaChampionshipBadges?: unknown;
};

export async function readMuseunCosmeticAppearanceMap(
  userIds: readonly string[],
): Promise<Map<string, MuseunCosmeticAppearance>> {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueUserIds.length === 0) return new Map();
  const rows = await db
    .select({ userId: savesKv.userId, value: savesKv.value })
    .from(savesKv)
    .where(
      and(
        eq(savesKv.key, "character.v2"),
        inArray(savesKv.userId, uniqueUserIds),
      ),
    );
  return new Map(
    rows.map((row) => {
      const character = row.value as CharacterCosmeticsSave | null;
      return [
        row.userId,
        museunCosmeticAppearance(
          character?.museunCosmetics,
          Date.now(),
          character?.arenaChampionshipBadges,
        ),
      ] as const;
    }),
  );
}

export async function readProfileAvatarMap(
  userIds: readonly string[],
): Promise<Map<string, Avatar>> {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueUserIds.length === 0) return new Map();
  const rows = await db
    .select({ userId: savesKv.userId, value: savesKv.value })
    .from(savesKv)
    .where(
      and(
        eq(savesKv.key, "character-profile.v2"),
        inArray(savesKv.userId, uniqueUserIds),
      ),
    );
  return new Map(
    rows.map((row) => [
      row.userId,
      readProfileValue(row.value)?.gender ?? "male1",
    ] as const),
  );
}
