import { expect, it } from "vitest";
import { applyV2DotsToTarget, distributeV2DotTicks, tickV2Dots, v2DotLogCause, type V2Dot } from "./combatDots";

it("ticks the final duration once, floors after stacking and does not mutate its input", () => {
  const dot: V2Dot = { tag: "bleed", label: "출혈", stacks: 3, maxStacks: 10, turns: 1, flatPerStack: 8.96, atkCoefPerStack: 0, pctMaxHpPerStack: 0, sourceAtk: 0 };
  const snapshot = structuredClone(dot);
  expect(tickV2Dots([dot])).toEqual({ nextDots: [], totalDmg: 26, ticks: [{ tag: "bleed", label: "출혈", stacks: 3, damage: 26 }] });
  expect(dot).toEqual(snapshot);
  expect(tickV2Dots([{ ...dot, turns: 0 }])).toEqual({ nextDots: [], totalDmg: 0, ticks: [] });
});

it("caps refreshed stacks without extending the supplied duration", () => {
  const dot: V2Dot = { tag: "poison", label: "중독", stacks: 9, maxStacks: 10, turns: 1, flatPerStack: 1, atkCoefPerStack: 0, pctMaxHpPerStack: 0, sourceAtk: 0 };
  const applied = applyV2DotsToTarget([dot], [{ ...dot, stacks: 3, turns: 4 }]);
  expect(applied).toEqual([{ ...dot, stacks: 10, turns: 4 }]);
  expect(distributeV2DotTicks([{ tag: "poison", label: "중독", damage: 3 }, { tag: "bleed", label: "출혈", damage: 7 }], 9)).toEqual([
    { tag: "poison", label: "중독", damage: 2 }, { tag: "bleed", label: "출혈", damage: 7 },
  ]);
});

it("shows stack counts for stackable DoTs in the log cause (#750)", () => {
  const bleed: V2Dot = { tag: "bleed", label: "출혈", stacks: 8, maxStacks: 10, turns: 2, flatPerStack: 10, atkCoefPerStack: 0, pctMaxHpPerStack: 0, sourceAtk: 0 };
  const burn: V2Dot = { tag: "burn", label: "연소", stacks: 1, maxStacks: 1, turns: 2, flatPerStack: 10, atkCoefPerStack: 0, pctMaxHpPerStack: 0, sourceAtk: 0 };
  const [bleedTick, burnTick] = tickV2Dots([bleed, burn]).ticks;
  expect(v2DotLogCause(bleedTick)).toBe("출혈(8)로");
  expect(v2DotLogCause({ tag: "poison", label: "중독", stacks: 1 })).toBe("중독(1)으로");
  expect(v2DotLogCause(burnTick)).toBe("화상으로");
  expect(distributeV2DotTicks([bleedTick], 50)).toEqual([{ ...bleedTick, damage: 50 }]);
});
