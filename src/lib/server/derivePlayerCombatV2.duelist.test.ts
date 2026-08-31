import { describe, expect, it } from "vitest";
import { derivePlayerCombatV2FromSaves } from "./derivePlayerCombatV2";

function derive(specChoice: string, equipped: string[]) {
  return derivePlayerCombatV2FromSaves({
    character: { class: "warrior", specChoice, level: 50 },
    equipmentSave: {},
    proficiencyRaw: {},
    skillsRaw: { learned: equipped, equipped },
  })!.player;
}

describe("결투가 전투 스냅샷", () => {
  it.each([
    ["duelist", 35],
    ["contender", 40],
    ["undefeated", 45],
    ["grandchampion", 50],
  ])("%s의 합법 로드아웃에 태세 +%d%%를 고정한다", (jobId, pct) => {
    expect(derive(jobId, ["v2c_duelist_declaration"]).duelistStanceBonusPct).toBe(pct);
  });

  it("공격 스킬 하나가 태세를 끄고 차단 이름을 남긴다", () => {
    expect(derive("grandchampion", ["v2c_paladin_cleave"])).toMatchObject({
      duelistStanceBonusPct: 0,
      duelistStanceBlockingSkillName: "심판",
    });
  });

  it("다른 직업은 휴대 패시브만 받고 현재 직업 태세는 받지 않는다", () => {
    const player = derive("paladin", [
      "v2c_contender_precision",
      "v2c_undefeated_rhythm",
      "v2c_grandchampion_instinct",
    ]);
    expect(player.duelistStanceBonusPct ?? 0).toBe(0);
    expect(player.basicDefPenetrationPct).toBe(10);
    expect(player.basicCritHastePct).toBe(8);
    expect(player.basicCritChanceCap).toBe(85);
  });
});
