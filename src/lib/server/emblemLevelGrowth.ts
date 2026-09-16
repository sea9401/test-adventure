import { computeStatFloors } from "@/adventure/data/v2/statGrowth";
import { emptyEmblemGrowth, parseEmblemState, rollEmblemGrowth } from "@/adventure/data/v2/emblems";
import { V2_STAT_KEYS } from "@/adventure/data/v2/v2StatKeys";
import { effectiveStatCap, type V2ProficiencyState } from "@/adventure/data/v2/proficiency";

/** Run under the character lock, using the equipment snapshot at the actual level-up. */
export function applyEmblemLevelGrowth(args: {
  proficiency: V2ProficiencyState;
  emblems: unknown;
  levelsGained: number;
  rng?: () => number;
}) {
  const rolled = rollEmblemGrowth(parseEmblemState(args.emblems), args.levelsGained, args.rng);
  if (Object.values(rolled).every((value) => value === 0)) return { proficiency: args.proficiency, gained: emptyEmblemGrowth() };
  const grown = { ...args.proficiency.grown };
  const floors = computeStatFloors(args.proficiency);
  for (const stat of V2_STAT_KEYS) {
    const room = Math.max(0, effectiveStatCap(args.proficiency.caps[stat] ?? 0) - floors[stat] - (grown[stat] ?? 0));
    rolled[stat] = Math.min(rolled[stat], room);
    if (rolled[stat]) grown[stat] = (grown[stat] ?? 0) + rolled[stat];
  }
  const previous = args.proficiency.emblemCycleGrowth ?? { hp: 0, mp: 0 };
  return {
    proficiency: {
      ...args.proficiency, grown,
      emblemCycleGrowth: { hp: previous.hp + rolled.hp, mp: previous.mp + rolled.mp },
    },
    gained: rolled,
  };
}
