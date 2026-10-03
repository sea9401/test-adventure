import { describe, expect, it } from "vitest";
import type { EmblemState } from "@/adventure/data/v2/emblems";
import {
  emblemGrowthSummary,
  groupEmblems,
  pickEquipInstance,
  pickFusionPair,
} from "./emblemInventory";

const state: EmblemState = {
  revision: 3,
  slots: ["hp-3-a", "str-1-a", null, "hp-3-b"],
  owned: [
    { iid: "luk-5", kind: "luk", grade: 5 },
    { iid: "hp-1", kind: "hp", grade: 1 },
    { iid: "str-1-a", kind: "str", grade: 1 },
    { iid: "hp-3-a", kind: "hp", grade: 3 },
    { iid: "str-1-b", kind: "str", grade: 1 },
    { iid: "hp-3-b", kind: "hp", grade: 3 },
    { iid: "str-1-c", kind: "str", grade: 1 },
  ],
};

describe("groupEmblems", () => {
  it("묶음을 종류 순서(HP·MP·능력치)와 높은 등급 순으로 만들고 장착 수를 센다", () => {
    const rows = groupEmblems(state);

    expect(rows.map((row) => row.kind)).toEqual(["hp", "str", "luk"]);
    expect(rows[0].groups.map((group) => [group.grade, group.count, group.equipped])).toEqual([
      [3, 2, 2],
      [1, 1, 0],
    ]);
    expect(rows[1].groups).toEqual([
      expect.objectContaining({ grade: 1, count: 3, equipped: 1, fusible: true }),
    ]);
  });

  it("장착하지 않은 같은 문장이 있어야 합성 가능으로 표시하고 5등급은 제외한다", () => {
    const rows = groupEmblems(state);
    const hp3 = rows[0].groups[0];
    const luk5 = rows[2].groups[0];

    expect(hp3.fusible).toBe(false);
    expect(luk5.fusible).toBe(false);
  });
});

describe("emblemGrowthSummary", () => {
  it("장착한 문장의 레벨업당 최대치를 종류별로 합산한다", () => {
    expect(emblemGrowthSummary(state)).toEqual([
      { kind: "hp", max: 20 },
      { kind: "str", max: 1 },
    ]);
  });

  it("장착한 문장이 없으면 빈 목록을 돌려준다", () => {
    expect(emblemGrowthSummary({ ...state, slots: [null, null, null, null] })).toEqual([]);
  });
});

describe("pickFusionPair", () => {
  it("장착 중인 문장을 대상으로, 장착하지 않은 같은 문장을 재료로 고른다", () => {
    expect(pickFusionPair(state, "str", 1)).toEqual({ targetIid: "str-1-a", materialIid: "str-1-b" });
  });

  it("장착하지 않은 재료가 없으면 null을 돌려준다", () => {
    expect(pickFusionPair(state, "hp", 3)).toBeNull();
    expect(pickFusionPair(state, "hp", 1)).toBeNull();
  });
});

describe("pickEquipInstance", () => {
  it("장착하지 않은 같은 문장을 고르고, 모두 장착 중이면 null을 돌려준다", () => {
    expect(pickEquipInstance(state, "str", 1)).toBe("str-1-b");
    expect(pickEquipInstance(state, "hp", 3)).toBeNull();
  });
});
