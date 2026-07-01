import { describe, expect, it } from "vitest";
import {
  countCraftOnlyEquipmentCodex,
  craftOnlyCodexRewardViews,
  craftOnlyCodexRewardTitleIds,
  equipmentCodexSpBonusForCount,
  nextEquipmentCodexMilestone,
  parseEquipmentCodex,
  withRegisteredEquipmentId,
} from "./equipmentCodex";

describe("equipmentCodex", () => {
  it("유효 장비 id만 중복 없이 정규화한다", () => {
    const codex = parseEquipmentCodex({
      registeredIds: [
        "v2_iron_sword",
        "missing",
        "v2_iron_sword",
        "v2_oak_staff",
        123,
      ],
    });
    expect(codex.registeredIds).toEqual(["v2_oak_staff", "v2_iron_sword"]);
  });

  it("마일스톤마다 SP 1씩 지급하고 다음 단계도 반환한다", () => {
    expect(equipmentCodexSpBonusForCount(14)).toBe(0);
    expect(equipmentCodexSpBonusForCount(15)).toBe(1);
    expect(equipmentCodexSpBonusForCount(65)).toBe(3);
    expect(equipmentCodexSpBonusForCount(130)).toBe(5);
    expect(equipmentCodexSpBonusForCount(150)).toBe(6);
    expect(equipmentCodexSpBonusForCount(180)).toBe(7);
    expect(nextEquipmentCodexMilestone(35)).toBe(65);
    expect(nextEquipmentCodexMilestone(130)).toBe(150);
    expect(nextEquipmentCodexMilestone(150)).toBe(180);
    expect(nextEquipmentCodexMilestone(180)).toBeNull();
  });

  it("등록은 카탈로그 id 기준으로 한 번만 추가한다", () => {
    const first = withRegisteredEquipmentId({}, "v2_iron_sword");
    expect(first.added).toBe(true);
    expect(first.codex.registeredIds).toEqual(["v2_iron_sword"]);

    const again = withRegisteredEquipmentId(first.codex, "v2_iron_sword");
    expect(again.added).toBe(false);
    expect(again.codex.registeredIds).toEqual(["v2_iron_sword"]);
  });

  it("제작 전용 도감 등록 수와 칭호 보상 단계를 계산한다", () => {
    const ids = [
      "v2_crafted_oathblade",
      "v2_crafted_gale_bow",
      "v2_crafted_runic_staff",
      "v2_crafted_master_ring",
      "v2_iron_sword",
    ];
    expect(countCraftOnlyEquipmentCodex(ids)).toBe(4);
    expect(craftOnlyCodexRewardTitleIds(3)).toEqual([]);
    expect(craftOnlyCodexRewardTitleIds(4)).toEqual([
      "artisan_codex_collector",
    ]);
    expect(craftOnlyCodexRewardTitleIds(10)).toEqual([
      "artisan_codex_collector",
      "artisan_codex_curator",
      "artisan_codex_master",
    ]);
    expect(craftOnlyCodexRewardViews(["artisan_codex_collector"])).toEqual([
      {
        count: 4,
        titleId: "artisan_codex_collector",
        label: "장인표 수집가",
        artisanXp: 60,
        materials: { v2_craft_refined_iron: 4 },
      },
    ]);
  });
});
