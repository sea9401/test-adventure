import { describe, expect, it } from "vitest";
import {
  COOP_BOSSES,
  coopBossForBattle,
} from "./coopBosses";
import { V2_EQUIP_TAG_SETS } from "./v2Equipment";
import { questById, type QuestCtx } from "./v2Quests";

describe("August 10 squash regression contracts", () => {
  it("keeps the restored cooperative boss HP and derived combat balance", () => {
    expect(COOP_BOSSES.lake_sovereign.sharedMaxHp).toBe(270_000);
    expect(COOP_BOSSES.void_priest.sharedMaxHp).toBe(630_000);
    expect(COOP_BOSSES.mountain_chief_hard.sharedMaxHp).toBe(1_200_000);
    expect(COOP_BOSSES.abyssal_tyrant.sharedMaxHp).toBe(1_400_000);

    const hardSangoon = coopBossForBattle(
      COOP_BOSSES.mountain_chief_hard,
      COOP_BOSSES.mountain_chief_hard.sharedMaxHp,
    ).monster;
    expect(hardSangoon.atk).toBe(655);
    expect(hardSangoon.def).toBe(484);
    expect(hardSangoon.accuracy).toBeCloseTo(104.76274329310041);
    expect(COOP_BOSSES.lake_sovereign.base.skill).toMatchObject({
      kind: "chill",
      dmgPerStack: 17,
    });
    expect(COOP_BOSSES.abyssal_tyrant.base.atkType).toBe("magic");
  });

  it("keeps all three confirmed tier-six set completion effects", () => {
    const completionLabels = new Map(
      V2_EQUIP_TAG_SETS.map((set) => [
        set.id,
        set.thresholds.find((threshold) => threshold.count === 6)?.signature
          ?.label,
      ]),
    );

    expect(completionLabels.get("storm_pursuit")).toBe("천공질주");
    expect(completionLabels.get("storm_shadow")).toBe("무풍연살");
    expect(completionLabels.get("storm_venom")).toBe("만독순환");
  });

  it("uses cumulative unique acquisitions instead of current ownership", () => {
    const firstFive = questById("a_unique5")!;
    const soldAfterAcquisition = {
      uniqueAcquired: 5,
      uniqueOwned: 0,
    } as unknown as QuestCtx;
    const ownedWithoutAcquisitionHistory = {
      uniqueAcquired: 0,
      uniqueOwned: 5,
    } as unknown as QuestCtx;

    expect(firstFive.check(soldAfterAcquisition)).toBe(true);
    expect(firstFive.check(ownedWithoutAcquisitionHistory)).toBe(false);
  });
});
