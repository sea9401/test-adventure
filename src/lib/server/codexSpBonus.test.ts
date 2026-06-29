import { describe, expect, it } from "vitest";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";
import { codexSpBonusFromRaw } from "./codexSpBonus";

describe("codexSpBonusFromRaw", () => {
  it("장비 도감 SP 보너스를 total 에 포함한다", () => {
    const registeredIds = Object.keys(V2_EQUIPMENT).slice(0, 15);
    const bonus = codexSpBonusFromRaw({}, {}, { registeredIds });

    expect(bonus.fishSp).toBe(0);
    expect(bonus.treasureSp).toBe(0);
    expect(bonus.equipmentSp).toBe(1);
    expect(bonus.total).toBe(1);
  });

  it("장비 raw 를 넘기지 않으면 기존 물고기/보물 도감 total 만 계산한다", () => {
    const bonus = codexSpBonusFromRaw({}, {});

    expect(bonus.equipmentSp).toBe(0);
    expect(bonus.total).toBe(0);
  });
});
