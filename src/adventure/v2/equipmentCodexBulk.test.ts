import { describe, expect, it } from "vitest";
import type {
  V2EquipInstance,
  V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";
import { selectEquipmentCodexBulkCandidates } from "./equipmentCodexBulk";

const id = (value: string) => value as V2EquipmentId;

describe("selectEquipmentCodexBulkCandidates", () => {
  it("미등록 종류마다 미장착·미잠금 장비 한 개만 고른다", () => {
    const owned: V2EquipInstance[] = [
      { iid: "registered", id: id("v2_iron_sword") },
      { iid: "equipped", id: id("v2_greatsword") },
      { iid: "greatsword", id: id("v2_greatsword") },
      { iid: "locked", id: id("v2_wooden_bow"), locked: true },
    ];

    const candidates = selectEquipmentCodexBulkCandidates({
      owned,
      equipped: { weapon: "equipped" },
      registeredIds: new Set([id("v2_iron_sword")]),
      slot: "weapon",
    });

    expect(candidates.map(({ inst }) => inst.iid)).toEqual(["greatsword"]);
    expect(candidates[0]?.ownedCount).toBe(2);
  });

  it("같은 종류에서는 강화와 품질이 낮은 개체를 우선 선택한다", () => {
    const candidates = selectEquipmentCodexBulkCandidates({
      owned: [
        {
          iid: "enhanced",
          id: id("v2_iron_sword"),
          enhance: { level: 1, bonusPct: 1 },
        },
        {
          iid: "plain",
          id: id("v2_iron_sword"),
          roll: { power: 0.8, weight: 1 },
        },
      ],
      equipped: {},
      registeredIds: new Set(),
      slot: "weapon",
    });

    expect(candidates.map(({ inst }) => inst.iid)).toEqual(["plain"]);
    expect(candidates[0]?.ownedCount).toBe(2);
  });
});
