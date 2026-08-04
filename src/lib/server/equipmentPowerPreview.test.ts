import { describe, expect, it } from "vitest";
import { previewEquipmentPowerFromSaves } from "./equipmentPowerPreview";

const character = {
  level: 50,
  hp: 500,
  mp: 100,
  class: "warrior",
  selectedStance: null,
  specChoice: null,
};

const equipmentSave = {
  owned: [
    { iid: "iron", id: "v2_iron_sword" },
    { iid: "great", id: "v2_greatsword" },
  ],
  equipped: { weapon: "iron" },
};

describe("previewEquipmentPowerFromSaves", () => {
  it("후보를 임시 장착한 정확한 전투력과 증감을 반환한다", () => {
    const preview = previewEquipmentPowerFromSaves({
      character,
      equipmentSave,
      proficiencyRaw: {},
      skillsRaw: { learned: [], equipped: [] },
      candidate: { iid: "great" },
    });

    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.candidatePower).toBeGreaterThan(preview.currentPower);
    expect(preview.delta).toBe(
      preview.candidatePower - preview.currentPower,
    );
    expect(equipmentSave.equipped.weapon).toBe("iron");
  });

  it("보유하지 않은 개체와 캐릭터 없는 상태를 거부한다", () => {
    expect(
      previewEquipmentPowerFromSaves({
        character,
        equipmentSave,
        proficiencyRaw: {},
        skillsRaw: {},
        candidate: { iid: "missing" },
      }),
    ).toEqual({ ok: false, error: "not_owned" });
    expect(
      previewEquipmentPowerFromSaves({
        character: undefined,
        equipmentSave,
        proficiencyRaw: {},
        skillsRaw: {},
        candidate: { iid: "great" },
      }),
    ).toEqual({ ok: false, error: "no_character" });
  });

  it("거래소 장비 스냅샷도 저장 변경 없이 미리 계산한다", () => {
    const preview = previewEquipmentPowerFromSaves({
      character,
      equipmentSave,
      proficiencyRaw: {},
      skillsRaw: {},
      candidate: {
        itemId: "v2_greatsword",
        roll: { power: 30, weight: 0 },
      },
    });

    expect(preview.ok).toBe(true);
    if (preview.ok) expect(preview.delta).toBeGreaterThan(0);
  });
});
