import { stormExpeditionEnemy } from "./stormExpedition";
import { describe, expect, it } from "vitest";
import {
  SANCTUARY_HARD_DEPTH_BONUS, canEnterSanctuary, createSanctuaryActive, parseSanctuaryState,
  advanceSanctuary, sanctuaryNode, sanctuaryChoices, sanctuaryEnemy,
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

describe("sanctuary difficulty", () => {
  it("reads legacy or idle saves as normal and keeps hard only for an active run", () => {
    const active = createSanctuaryActive(1000, 300, () => 0);
    expect(parseSanctuaryState({ active }).difficulty).toBe("normal");
    expect(parseSanctuaryState({ active, difficulty: "hard" }).difficulty).toBe("hard");
    expect(parseSanctuaryState({ active, difficulty: "nightmare" }).difficulty).toBe("normal");
    expect(parseSanctuaryState({ difficulty: "hard" }).difficulty).toBe("normal");
  });
  it("makes every hard encounter stronger while keeping its name", () => {
    let active = createSanctuaryActive(1000, 300, () => 0);
    while (true) {
      if (sanctuaryNode(active).kind === "battle") {
        const normal = sanctuaryEnemy(active);
        const hard = sanctuaryEnemy(active, "hard");
        expect(hard.name).toBe(normal.name);
        expect(hard.hp).toBeGreaterThan(normal.hp);
        expect(hard.atk).toBeGreaterThan(normal.atk);
      }
      const next = advanceSanctuary(active);
      if (!next) break;
      active = next;
    }
  });
});

describe("성소 심층 단계", () => {
  it("최고 완주 단계와 진행 중 탐험의 단계를 읽는다", () => {
    const active = { ...createSanctuaryActive(1_000, 500), deepStage: 3 };
    const state = parseSanctuaryState({ active, difficulty: "hard", deepBest: 4, deepBestAt: 1_234 });

    expect(state.deepBest).toBe(4);
    expect(state.deepBestAt).toBe(1_234);
    expect(state.active?.deepStage).toBe(3);
    expect(parseSanctuaryState({}).deepBest).toBe(0);
    expect(parseSanctuaryState({ active: createSanctuaryActive(1_000, 500) }).active).not.toHaveProperty("deepStage");
  });

  it("하드가 아닌 탐험에는 심층 단계를 두지 않는다", () => {
    const active = { ...createSanctuaryActive(1_000, 500), deepStage: 3 };

    expect(parseSanctuaryState({ active, difficulty: "normal" }).active).not.toHaveProperty("deepStage");
  });

  it("심층 적은 하드 가산치 위에 단계마다 깊이 8을 더한다", () => {
    const active = { ...createSanctuaryActive(1_000, 500), deepStage: 2 };
    const deep = sanctuaryEnemy(active, "hard");
    const expected = stormExpeditionEnemy("wreckage", "early_trash", 0, SANCTUARY_HARD_DEPTH_BONUS + 16);
    const hard = sanctuaryEnemy(createSanctuaryActive(1_000, 500), "hard");

    expect(deep.hp).toBe(expected.hp);
    expect(deep.atk).toBe(expected.atk);
    expect(deep.hp).toBeGreaterThan(hard.hp);
  });
});
