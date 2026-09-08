import { describe, expect, it } from "vitest";
import { emptyProficiency } from "@/adventure/data/v2/proficiency";
import { V2_STAT_KEYS } from "@/adventure/data/v2/v2StatKeys";
import { applyHuntProficiency } from "@/app/api/v2/dungeon/hunt/huntProficiency";
import { applyExpTomeGrant } from "./expTomeGrant";
import { applyLevelTargetGrant } from "./levelTargetGrant";

describe("independent level growth across grants", () => {
  it("hunt, EXP and target-level grants apply identical mastery growth to all eight values", () => {
    const raw = {
      ...emptyProficiency(),
      caps: Object.fromEntries(V2_STAT_KEYS.map((s) => [s, 10_000])),
      groups: {
        warrior: { tier: 1, cultivations: 0, cumLevel: 100_000 },
        mage: { tier: 1, cultivations: 0, cumLevel: 100_000 },
      },
      lifeResourceGrowth: { version: 2 as const, rolledLevel: 1,
        baseHp: 160, baseMp: 80, gainedHp: 0, gainedMp: 0 },
    };
    const charSave = { class: "warrior", level: 1, exp: 0 };
    const rng = () => 0.999999;
    const exp = applyExpTomeGrant(charSave, raw, 100, rng);
    expect(exp.levelsGained).toBeGreaterThan(0);
    const target = applyLevelTargetGrant(charSave, raw, exp.level, rng);
    const hunt = applyHuntProficiency({ won: false, depth: 1, charSave,
      proficiencyRaw: raw, equippedSkills: [], proficiencyChancePct: 0,
      levelsGained: exp.levelsGained, rng });
    expect(target.proficiency.grown).toEqual(exp.proficiency.grown);
    expect(hunt.nextProficiency?.grown).toEqual(exp.proficiency.grown);
    expect(hunt.statGains).toEqual(exp.proficiency.grown);
    for (const stat of V2_STAT_KEYS) expect(exp.proficiency.grown[stat]).toBeGreaterThan(0);
    expect(exp.proficiency.grown.str).toBe(exp.levelsGained * 4);
    expect(target.hpGain).toBe(exp.hpGain);
    expect(target.mpGain).toBe(exp.mpGain);
    expect(hunt.hpGain).toBe(exp.hpGain);
    expect(hunt.mpGain).toBe(exp.mpGain);
    expect(hunt.nextProficiency?.lifeResourceGrowth).toEqual(exp.proficiency.lifeResourceGrowth);
    expect(raw.lifeResourceGrowth.gainedHp).toBe(0);
  });
});
