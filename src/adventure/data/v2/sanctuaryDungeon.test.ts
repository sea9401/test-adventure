import { describe, expect, it } from "vitest";
import {
  canEnterSanctuary, createSanctuaryActive, parseSanctuaryState,
  advanceSanctuary, sanctuaryNode, sanctuaryChoices,
  DEFAULT_SANCTUARY_AUTO_PREFERENCES, parseSanctuaryAutoPreferences, pickSanctuaryAutoChoice,
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

describe("sanctuary auto run preferences", () => {
  it("keeps valid ids in the given order, drops unknown or duplicate ids and appends the rest", () => {
    const prefs = parseSanctuaryAutoPreferences({
      supply: ["storm_oil", "storm_oil", "scavenged_coffer", "nope"],
      camp: "deep_rest",
      altar: ["victory_vigor", "deep_mana"],
    });
    expect(prefs.supply).toEqual(["storm_oil", "field_rations", "mana_ampoule", "wind_barrier"]);
    expect(prefs.camp).toEqual(DEFAULT_SANCTUARY_AUTO_PREFERENCES.camp);
    expect(prefs.altar.slice(0, 2)).toEqual(["victory_vigor", "deep_mana"]);
    expect(prefs.altar).toHaveLength(5);
    expect(prefs.final_prep).toEqual(DEFAULT_SANCTUARY_AUTO_PREFERENCES.final_prep);
    expect(parseSanctuaryAutoPreferences(null)).toEqual(DEFAULT_SANCTUARY_AUTO_PREFERENCES);
  });
  it("picks the highest preference that the current node offers", () => {
    const active = createSanctuaryActive(1000, 300, () => 0);
    const prefs = parseSanctuaryAutoPreferences({ supply: ["wind_barrier"], altar: ["victory_vigor", "deep_mana", "swift_fate"] });
    expect(pickSanctuaryAutoChoice({ ...active, currentNodeId: "supply" }, prefs)).toBe("wind_barrier");
    const altar = { ...active, currentNodeId: "altar" as const, altarOffers: ["tempest_might", "deep_mana", "storm_guard"] as typeof active.altarOffers };
    expect(pickSanctuaryAutoChoice(altar, prefs)).toBe("deep_mana");
    expect(pickSanctuaryAutoChoice(active, prefs)).toBeNull();
  });
  it("stores the last auto preferences with the dungeon state", () => {
    const state = parseSanctuaryState({ autoPreferences: { camp: ["meditation"] } });
    expect(state.autoPreferences.camp[0]).toBe("meditation");
    expect(parseSanctuaryState({}).autoPreferences).toEqual(DEFAULT_SANCTUARY_AUTO_PREFERENCES);
  });
});
