import { describe, expect, it } from "vitest";
import {
  canEnterSanctuary, createSanctuaryActive, parseSanctuaryState,
  advanceSanctuary, sanctuaryNode, sanctuaryChoices,
} from "./sanctuaryDungeon";

describe("sanctuary linear expedition", () => {
  it("requires unexplored unlock and retains access after reincarnation", () => {
    expect(canEnterSanctuary({ level: 99 })).toBe(false);
    expect(canEnterSanctuary({ level: 100 })).toBe(true);
    expect(canEnterSanctuary({ level: 1, unexplored: { xpPoints: 1 } })).toBe(true);
  });
  it("resets only daily attempts at Korean midnight, preserving the run and revision", () => {
    const active = createSanctuaryActive(1000, 300, () => 0);
    const state = parseSanctuaryState({ date: "2026-09-16", attemptsUsed: 3, revision: 15, active, pendingEmblems: [{ iid: "drop", kind: "hp", grade: 1 }] }, "2026-09-17");
    expect(state.attemptsUsed).toBe(0);
    expect(state.active?.hp).toBe(1000);
    expect(state.revision).toBe(15);
    expect(state.pendingEmblems).toHaveLength(1);
  });
  it("always advances in one line, with two encounters in each general battle", () => {
    let active = createSanctuaryActive(1000, 300, () => 0);
    const kinds: string[] = [];
    while (true) {
      const node = sanctuaryNode(active);
      kinds.push(node.kind === "battle" ? node.encounterKind! : node.kind);
      const next = advanceSanctuary(active);
      if (!next) break;
      active = next;
    }
    expect(kinds).toEqual(["early_trash", "early_trash", "supply", "late_trash", "late_trash", "camp", "elite", "altar", "guardian", "final_prep", "final_boss"]);
  });
  it("offers only useful supply effects and restores saved altar offers", () => {
    const active = createSanctuaryActive(1000, 300, () => 0);
    expect(sanctuaryChoices({ ...active, currentNodeId: "supply" }).map((choice) => choice.id)).not.toContain("scavenged_coffer");
    const altar = { ...active, currentNodeId: "altar" as const };
    expect(sanctuaryChoices(altar).map((choice) => choice.id)).toEqual(active.altarOffers);
  });
});
