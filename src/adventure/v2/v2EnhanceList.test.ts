import { describe, expect, it } from "vitest";
import type { V2EquipInstance } from "@/adventure/data/v2/v2Equipment";
import {
  enhanceTierOptions,
  filterEnhanceCandidates,
  sortEnhanceCandidates,
} from "./v2EnhanceList";

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

const pool: V2EquipInstance[] = [
  { iid: "iron", id: "v2_iron_sword" },
  { iid: "iron-locked", id: "v2_iron_sword", locked: true },
  { iid: "oath", id: "v2_crafted_oathblade" },
  { iid: "axe-locked", id: "v2_crafted_kingbreaker_axe", locked: true },
];

describe("filterEnhanceCandidates", () => {
  const ids = (list: V2EquipInstance[]) => list.map((item) => item.iid);

  it("조건이 없으면 순서를 바꾸지 않고 전부 돌려준다", () => {
    expect(ids(filterEnhanceCandidates(pool, { search: "", lock: "all", tier: "all" }))).toEqual([
      "iron",
      "iron-locked",
      "oath",
      "axe-locked",
    ]);
  });

  it("이름 일부로 찾는다", () => {
    expect(ids(filterEnhanceCandidates(pool, { search: " 철검", lock: "all", tier: "all" }))).toEqual([
      "iron",
      "iron-locked",
    ]);
  });

  it("잠금 상태로 거른다", () => {
    expect(ids(filterEnhanceCandidates(pool, { search: "", lock: "locked", tier: "all" }))).toEqual([
      "iron-locked",
      "axe-locked",
    ]);
    expect(ids(filterEnhanceCandidates(pool, { search: "", lock: "unlocked", tier: "all" }))).toEqual([
      "iron",
      "oath",
    ]);
  });

  it("표시 티어로 거르고 다른 조건과 함께 적용한다", () => {
    expect(ids(filterEnhanceCandidates(pool, { search: "", lock: "all", tier: 2 }))).toEqual(["oath"]);
    expect(ids(filterEnhanceCandidates(pool, { search: "철검", lock: "locked", tier: 1 }))).toEqual([
      "iron-locked",
    ]);
  });
});

describe("enhanceTierOptions", () => {
  it("보유한 장비의 표시 티어만 높은 순으로 개수와 함께 돌려준다", () => {
    expect(enhanceTierOptions(pool)).toEqual([
      { tier: 4, count: 1 },
      { tier: 2, count: 1 },
      { tier: 1, count: 2 },
    ]);
  });
});
