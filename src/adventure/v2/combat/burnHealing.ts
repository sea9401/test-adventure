import { BURN_HEAL_REDUCTION_PCT } from "@/adventure/data/v2/statusEffects";
import { type V2DotList } from "./combatShared";

/** 연소와 별도 치유 감소는 곱하지 않고 강한 쪽을 적용한다. */
export function healingReductionPct(dots: V2DotList, explicitPct = 0): number {
  const burning = dots.some(dot => dot.tag === "burn" && dot.stacks > 0 && dot.turns > 0);
  return Math.min(100, Math.max(0, explicitPct, burning ? BURN_HEAL_REDUCTION_PCT : 0));
}

export function healingAfterBurn(amount: number, dots: V2DotList, explicitPct = 0): number {
  const reduction = healingReductionPct(dots, explicitPct);
  return reduction > 0 ? Math.floor(amount * (1 - reduction / 100)) : amount;
}
