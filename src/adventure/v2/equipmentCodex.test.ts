import { describe, expect, it } from "vitest";
import {
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
});
