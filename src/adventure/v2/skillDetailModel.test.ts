import { describe, expect, it } from "vitest";
import { buildSkillDetailModel } from "./skillDetailModel";

describe("buildSkillDetailModel", () => {
  it("builds automatic facts for a legacy skill without manual detail", () => {
    const model = buildSkillDetailModel("v2_skill_strike");

    expect(model).toMatchObject({
      skillId: "v2_skill_strike",
      name: "강타",
    });
    expect(model?.facts.some((fact) => fact.includes("공격력×1"))).toBe(true);
    expect(model?.facts.some((fact) => fact.startsWith("SP "))).toBe(true);
    expect(model?.sections.every((section) => section.items.length > 0)).toBe(
      true,
    );
  });

  it("returns null for an unknown skill id", () => {
    expect(buildSkillDetailModel("missing_skill")).toBeNull();
  });

  it("expands variants and synergies with user-facing skill names", () => {
    const model = buildSkillDetailModel("v2c_primordialmage_return");
    const text = model?.sections
      .flatMap((section) => section.items)
      .join("\n") ?? "";

    expect(text).not.toMatch(/v2c_[a-z0-9_]+/);
    expect(text).toContain("홍련술");
    expect(text).toContain("근원공명");
    expect(model?.sections.map((section) => section.id)).toEqual(
      expect.arrayContaining(["variants", "automaticSynergies"]),
    );
    expect(model?.sections.every((section) => section.items.length > 0)).toBe(
      true,
    );
  });

  it("lists each elemental effect as a user-facing variant", () => {
    const model = buildSkillDetailModel("v2c_elementalist_magic");
    const variants = model?.sections.find(
      (section) => section.id === "variants",
    );

    expect(variants?.items).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^불 — /),
        expect.stringMatching(/^물 — /),
        expect.stringMatching(/^번개 — /),
      ]),
    );
  });

  it("formats equipped-synergy damage in the combined active-cast hit context", () => {
    const model = buildSkillDetailModel("v2c_runecaster_grandsigil");
    const synergies = model?.sections.find(
      (section) => section.id === "automaticSynergies",
    );

    expect(synergies?.items).toContain(
      "장착: 총명 — 2회 공격 · 피해 마법 공격력×0.55 + 지능×0.44",
    );
  });

  it("includes implied equipped synergies in an overlapping cast context", () => {
    const model = buildSkillDetailModel("v2c_primordialmage_return");
    const synergies = model?.sections.find(
      (section) => section.id === "automaticSynergies",
    );

    expect(synergies?.items).toContain(
      "장착: 근원공명, 오원소 폭주 — 3회 공격 · 피해 마법 공격력×0.37 + 지능×0.29",
    );
  });

  it("keeps manual sections in their canonical display order", () => {
    const model = buildSkillDetailModel("v2c_hegemon_annihilation");

    expect(model?.sections.map((section) => section.id)).toEqual([
      "mechanics",
      "synergies",
      "limitations",
      "pvp",
    ]);
  });
});
