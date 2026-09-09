import { type V2DotList } from "./combatDots";
import { BLEED_MAX_STACKS } from "@/adventure/data/v2/v2CombatConstants";
import { type BleedChangeIntent, type V2Dot } from "./combatDots";

export function bleedChangeLogText(
  change: Pick<BleedChangeIntent, "reason">,
  result: {
    previousStacks: number;
    resultingStacks: number;
    resultingTurns: number;
  },
): string {
  if (change.reason === "refresh") {
    const addedStacks = Math.max(0, result.resultingStacks - result.previousStacks);
    const stackText = addedStacks > 0
        ? `출혈 +${addedStacks}스택 (${result.resultingStacks}스택), `
        : "출혈 ";
    return `${stackText}지속이 ${result.resultingTurns}회로 갱신됐다.`;
  }
  return `출혈 지속이 ${result.resultingTurns}회로 늘어났다.`;
}

export function applyBleedChangeToDots(
  current: V2DotList,
  change: BleedChangeIntent | undefined,
): V2Dot[] {
  if (!change) return [...current];
  return current.map((dot) => {
    if (dot.tag !== "bleed" || dot.turns <= 0) return dot;
    const setTurns =
      change.setTurns == null
        ? dot.turns
        : Math.max(dot.turns, Math.max(0, Math.floor(change.setTurns)));
    const extendedTurns =
      setTurns + Math.max(0, Math.floor(change.extendTurns ?? 0));
    const turns =
      change.maxTurns == null
        ? extendedTurns
        : Math.min(
            Math.max(0, Math.floor(change.maxTurns)),
            extendedTurns,
          );
    return {
      ...dot,
      stacks: Math.min(
        BLEED_MAX_STACKS,
        dot.maxStacks,
        Math.max(0, dot.stacks + Math.floor(change.stacksToAdd)),
      ),
      turns,
    };
  });
}
