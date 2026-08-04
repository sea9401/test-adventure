import { describe, expect, it } from "vitest";
import type { V2EquipInstance } from "@/adventure/data/v2/v2Equipment";
import { sortEnhanceCandidates } from "./v2EnhanceList";

const candidates: V2EquipInstance[] = [
  {
    iid: "enhanced-seven",
    id: "v2_iron_sword",
    enhance: { level: 7, bonusPct: 12 },
  },
  { iid: "equipped", id: "v2_iron_sword" },
  {
    iid: "enhanced-five",
    id: "v2_iron_sword",
    enhance: { level: 5, bonusPct: 8 },
  },
];

describe("sortEnhanceCandidates", () => {
  it("착용 장비를 강화 단계보다 우선해 최상단에 둔다", () => {
    expect(sortEnhanceCandidates(candidates, "equipped").map((item) => item.iid)).toEqual([
      "equipped",
      "enhanced-seven",
      "enhanced-five",
    ]);
  });

  it("착용 장비가 없으면 기존 강화 단계 순서를 유지한다", () => {
    expect(sortEnhanceCandidates(candidates, null).map((item) => item.iid)).toEqual([
      "enhanced-seven",
      "enhanced-five",
      "equipped",
    ]);
  });
});
