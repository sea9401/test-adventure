import { describe, expect, it } from "vitest";
import {
  accumulateEnchantCombat,
  enchantCombatBonus,
  enchantStaticBonus,
  ZERO_ENCHANT_COMBAT_BONUS,
  type EnchantCombatBonus,
  type EnchantSlot,
} from "./enchant";

describe("enchantStaticBonus", () => {
  it("might/swift/insight 만 합산, 그 외 affix 는 무시", () => {
    const slots: EnchantSlot[] = [
      { affixId: "might", value: 5 },
      { affixId: "swift", value: 3 },
      { affixId: "insight", value: 2 },
      { affixId: "critical", value: 7 },
    ];
    const out = enchantStaticBonus(slots);
    expect(out).toEqual({
      atk: 5,
      str: 2,
      dex: 2,
      vit: 2,
      spd: 3 + 2,
      luk: 2,
    });
  });

  it("undefined/빈 배열은 빈 객체", () => {
    expect(enchantStaticBonus(undefined)).toEqual({});
    expect(enchantStaticBonus([])).toEqual({});
  });
});

describe("enchantCombatBonus — 공/방/보상 합산", () => {
  it("3 슬롯 자루 합산 — 같은 affix 누적", () => {
    const bonus = enchantCombatBonus([
      [
        { affixId: "critical", value: 5 },
        { affixId: "pierce", value: 3 },
      ],
      [
        { affixId: "critical", value: 8 },
        { affixId: "guard", value: 12 },
      ],
      [
        { affixId: "fortune", value: 20 },
      ],
    ]);
    expect(bonus.critPct).toBe(13);
    expect(bonus.pierceFlat).toBe(3);
    expect(bonus.guardBlockPct).toBe(12);
    expect(bonus.fortunePct).toBe(20);
    // 미장착 affix 는 0.
    expect(bonus.berserkBonusPct).toBe(0);
    expect(bonus.harvestPct).toBe(0);
  });

  it("venom 은 chance + dmg 둘 다 같은 값으로 누적", () => {
    const acc: EnchantCombatBonus = { ...ZERO_ENCHANT_COMBAT_BONUS };
    accumulateEnchantCombat(acc, [
      { affixId: "venom", value: 10 },
      { affixId: "venom", value: 5 },
    ]);
    expect(acc.venomChancePct).toBe(15);
    expect(acc.venomDmg).toBe(15);
  });

  it("정적 합산 affix (might/swift/insight) 는 combat bonus 에서 0 유지", () => {
    const bonus = enchantCombatBonus([
      [
        { affixId: "might", value: 10 },
        { affixId: "swift", value: 8 },
        { affixId: "insight", value: 3 },
      ],
    ]);
    expect(bonus).toEqual(ZERO_ENCHANT_COMBAT_BONUS);
  });

  it("undefined slots 입력은 0 결과", () => {
    const bonus = enchantCombatBonus([undefined, undefined, undefined]);
    expect(bonus).toEqual(ZERO_ENCHANT_COMBAT_BONUS);
  });

  it("모든 발동형 affix 가 한 번씩 들어가면 각각 합산", () => {
    const all: EnchantSlot[] = [
      { affixId: "critical", value: 1 },
      { affixId: "pierce", value: 1 },
      { affixId: "execute", value: 1 },
      { affixId: "berserk", value: 1 },
      { affixId: "breaker", value: 1 },
      { affixId: "lifesteal", value: 1 },
      { affixId: "venom", value: 1 },
      { affixId: "guard", value: 1 },
      { affixId: "dodge", value: 1 },
      { affixId: "endure", value: 1 },
      { affixId: "reflect", value: 1 },
      { affixId: "barrier", value: 1 },
      { affixId: "regen", value: 1 },
      { affixId: "awaken", value: 1 },
      { affixId: "fortune", value: 1 },
      { affixId: "bounty", value: 1 },
      { affixId: "harvest", value: 1 },
    ];
    const bonus = enchantCombatBonus([all]);
    expect(bonus.critPct).toBe(1);
    expect(bonus.pierceFlat).toBe(1);
    expect(bonus.executeBonusPct).toBe(1);
    expect(bonus.berserkBonusPct).toBe(1);
    expect(bonus.breakerBossBonusPct).toBe(1);
    expect(bonus.lifestealPct).toBe(1);
    expect(bonus.venomChancePct).toBe(1);
    expect(bonus.venomDmg).toBe(1);
    expect(bonus.guardBlockPct).toBe(1);
    expect(bonus.dodgePct).toBe(1);
    expect(bonus.endurePct).toBe(1);
    expect(bonus.reflectPct).toBe(1);
    expect(bonus.barrierPct).toBe(1);
    expect(bonus.regenPctPerTurn).toBe(1);
    expect(bonus.awakenApChancePct).toBe(1);
    expect(bonus.fortunePct).toBe(1);
    expect(bonus.bountyPct).toBe(1);
    expect(bonus.harvestPct).toBe(1);
  });
});
