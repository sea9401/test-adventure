import { describe, expect, it } from "vitest";
import {
  craftOnlyCodexRewardTitleIds,
  countCraftOnlyEquipmentCodex,
  parseEquipmentCodex,
  serializeEquipmentCodex,
} from "./equipmentCodex";

describe("equipmentCodex", () => {
  it("손상된 입력은 빈 도감으로 파싱한다", () => {
    expect([...parseEquipmentCodex(null)]).toEqual([]);
    expect([...parseEquipmentCodex({ registeredIds: "bad" })]).toEqual([]);
  });

  it("유효한 장비 id만 보존하고 중복을 제거한다", () => {
    const parsed = parseEquipmentCodex({
      registeredIds: [
        "v2_iron_sword",
        "missing_item",
        "v2_iron_sword",
        "v2_chain_mail",
      ],
    });

    expect([...parsed].sort()).toEqual(["v2_chain_mail", "v2_iron_sword"]);
  });

  it("직렬화도 유효한 장비 id만 저장한다", () => {
    expect(
      serializeEquipmentCodex([
        "v2_iron_sword",
        "missing_item",
        "v2_iron_sword",
      ]).registeredIds,
    ).toEqual(["v2_iron_sword"]);
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
  });
});
