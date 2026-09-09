import { describe, expect, it } from "vitest";
import { derivePlayerCombatV2FromSaves } from "./derivePlayerCombatV2";

function derive(specChoice: string, equipped: string[]) {
  return derivePlayerCombatV2FromSaves({
    character: { class: "warrior", specChoice, level: 50 },
    equipmentSave: {}, proficiencyRaw: {}, skillsRaw: { learned: equipped, equipped },
  })!.player;
}

describe("성기사 계열 서버 패시브 주입", () => {
  it.each(["templar", "crusader", "radiantknight", "dawnpaladin", "bloodtemplar", "transcendent"])("%s 저장 직업을 기준으로 계열 보너스를 적용한다", jobId => {
    const templar = ["templar", "crusader", "radiantknight", "dawnpaladin"].includes(jobId);
    const base = derive(jobId, []);
    const covenant = derive(jobId, ["v2c_dawnpaladin_covenant"]);
    expect((covenant.passiveDamageTakenReductionPct ?? 0) - (base.passiveDamageTakenReductionPct ?? 0)).toBe(templar ? 3 : 0);
    const grace = derive(jobId, ["v2c_radiantknight_grace"]);
    expect(grace.passiveDamageTakenReductionPct).toBe(5);
    expect(grace.healMult).toBeGreaterThan(base.healMult!);
  });
});
