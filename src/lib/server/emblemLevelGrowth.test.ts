import { describe, expect, it } from "vitest";
import { applyEmblemLevelGrowth } from "./emblemLevelGrowth";
import { emptyProficiency, parseProficiency, resetLevelGrowth } from "@/adventure/data/v2/proficiency";
import { parseEmblemState } from "@/adventure/data/v2/emblems";
import { derivePlayerCombatV2FromSaves } from "./derivePlayerCombatV2";
import { applyHuntProficiency } from "@/app/api/v2/dungeon/hunt/huntProficiency";
import { applyExpTomeGrant } from "./expTomeGrant";
import { applyLevelTargetGrant } from "./levelTargetGrant";

const emblems = parseEmblemState({ owned: [
  { iid: "hp", kind: "hp", grade: 5 }, { iid: "mp", kind: "mp", grade: 5 },
  { iid: "str", kind: "str", grade: 5 }, { iid: "str2", kind: "str", grade: 5 },
], slots: ["hp", "mp", "str", "str2"] });

describe("emblem growth persistence", () => {
  it("adds actual level gains to the character and retains them after unequipping", () => {
    const start = emptyProficiency();
    const result = applyEmblemLevelGrowth({ proficiency: start, emblems, levelsGained: 2, rng: () => 0.999 });
    expect(result.proficiency.emblemCycleGrowth).toEqual({ hp: 60, mp: 36 });
    expect(result.proficiency.grown.str).toBe(36);
    const saved = parseProficiency(result.proficiency);
    const after = applyEmblemLevelGrowth({ proficiency: saved, emblems: { ...emblems, slots: [null, null, null, null] }, levelsGained: 1, rng: () => 0.999 });
    expect(after.proficiency).toEqual(saved);
    const character = { class: "none", level: 3 };
    const base = derivePlayerCombatV2FromSaves({ character, proficiencyRaw: { ...saved, emblemCycleGrowth: undefined }, equipmentSave: {}, skillsRaw: {} });
    const buffed = derivePlayerCombatV2FromSaves({ character, proficiencyRaw: saved, equipmentSave: {}, skillsRaw: {} });
    expect(base).not.toBeNull();
    expect(buffed).not.toBeNull();
    if (!base || !buffed) throw new Error("character derivation failed");
    expect(buffed.player.maxHp - base.player.maxHp).toBe(60);
    expect(buffed.player.maxMp! - base.player.maxMp!).toBe(36);
    expect(start.grown).toEqual({});
  });
  it("uses normal stat caps and clears cycle gains on reincarnation", () => {
    const result = applyEmblemLevelGrowth({ proficiency: emptyProficiency(), emblems, levelsGained: 99, rng: () => 0.999 });
    expect(result.proficiency.grown.str).toBe(45); // base 15 + growth 45 = cap 60
    const reset = resetLevelGrowth(result.proficiency);
    expect(reset.grown).toEqual({});
    expect(reset.emblemCycleGrowth).toEqual({ hp: 0, mp: 0 });
    expect(emblems.owned).toHaveLength(4);
  });
  it("does not grow for no actual level-up or unowned/unequipped items", () => {
    const proficiency = emptyProficiency();
    expect(applyEmblemLevelGrowth({ proficiency, emblems, levelsGained: 0 }).proficiency).toBe(proficiency);
    expect(applyEmblemLevelGrowth({ proficiency, emblems: {}, levelsGained: 3 }).proficiency).toBe(proficiency);
  });
  it("connects ordinary/rare/unexplored/offline hunt growth and both level-grant paths", () => {
    const charSave = { class: "none", level: 1, emblems };
    const proficiency = emptyProficiency();
    const hunt = applyHuntProficiency({ won: true, depth: 2, charSave, proficiencyRaw: proficiency, equippedSkills: [], proficiencyChancePct: 0, levelsGained: 2, rng: () => 0.999 });
    expect(hunt.nextProficiency?.emblemCycleGrowth).toEqual({ hp: 60, mp: 36 });
    const grant = applyLevelTargetGrant(charSave, proficiency, 3, () => 0.999);
    expect(grant.proficiency.emblemCycleGrowth).toEqual({ hp: 60, mp: 36 });
    const exp = applyExpTomeGrant(charSave, proficiency, 100, () => 0.999);
    expect(exp.levelsGained).toBeGreaterThan(0);
    expect(exp.proficiency.emblemCycleGrowth).toEqual({ hp: exp.levelsGained * 30, mp: exp.levelsGained * 18 });
  });
});
