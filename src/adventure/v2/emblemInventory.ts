import { EMBLEM_KINDS, type Emblem } from "@/adventure/data/v2/emblems";

export type EmblemSort = "kind" | "grade" | "acquired";

/** Keep the original inventory number shared with fusion material labels. */
export function sortEmblemInventory(owned: readonly Emblem[], sort: EmblemSort) {
  const entries = owned.map((item, index) => ({ item, number: index + 1 }));
  if (sort === "acquired") return entries;

  return entries.sort((a, b) => {
    const kindOrder = EMBLEM_KINDS.indexOf(a.item.kind) - EMBLEM_KINDS.indexOf(b.item.kind);
    const gradeOrder = b.item.grade - a.item.grade;
    return (sort === "kind" ? kindOrder || gradeOrder : gradeOrder || kindOrder)
      || a.number - b.number;
  });
}
