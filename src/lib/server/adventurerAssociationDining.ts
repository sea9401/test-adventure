import { eq } from "drizzle-orm";
import type { db } from "@/db";
import { adventurerAssociationDiningWeekly } from "@/db/schema";
import type { GuildDiningMenuId } from "@/adventure/data/v2/guildDining";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type AssociationDiningWeekly = {
  weekKey: string;
  selectedMenuIds: GuildDiningMenuId[];
  pantryPoints: number;
  targetPoints: number;
};

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === "string"))]
    : [];
}

export async function lockAssociationDiningWeekly(
  tx: Tx,
  weekKey: string,
  defaultMenuIds: GuildDiningMenuId[],
): Promise<AssociationDiningWeekly> {
  await tx
    .insert(adventurerAssociationDiningWeekly)
    .values({ id: "global", weekKey, selectedMenuIds: defaultMenuIds })
    .onConflictDoNothing();
  let row = (
    await tx
      .select()
      .from(adventurerAssociationDiningWeekly)
      .where(eq(adventurerAssociationDiningWeekly.id, "global"))
      .for("update")
      .limit(1)
  )[0];
  if (row.weekKey !== weekKey) {
    row = (
      await tx
        .update(adventurerAssociationDiningWeekly)
        .set({
          weekKey,
          selectedMenuIds: defaultMenuIds,
          pantryPoints: 0,
          targetPoints: 400,
          updatedAt: new Date(),
        })
        .where(eq(adventurerAssociationDiningWeekly.id, "global"))
        .returning()
    )[0];
  }
  return {
    weekKey,
    selectedMenuIds: stringList(row.selectedMenuIds) as GuildDiningMenuId[],
    pantryPoints: Math.max(0, Math.floor(row.pantryPoints)),
    targetPoints: Math.max(1, Math.floor(row.targetPoints)),
  };
}

export async function saveAssociationDiningWeekly(
  tx: Tx,
  state: AssociationDiningWeekly,
): Promise<void> {
  await tx
    .update(adventurerAssociationDiningWeekly)
    .set({
      weekKey: state.weekKey,
      selectedMenuIds: state.selectedMenuIds,
      pantryPoints: state.pantryPoints,
      targetPoints: state.targetPoints,
      updatedAt: new Date(),
    })
    .where(eq(adventurerAssociationDiningWeekly.id, "global"));
}
