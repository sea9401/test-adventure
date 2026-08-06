import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  PatternChoiceButtons,
  PatternChoicePicker,
  SkillPatternChoiceList,
  SkillPatternPicker,
  filterPatternChoiceOptions,
} from "./V2CombatPatternView";

const OPTIONS = [
  { value: "always", label: "항상", group: "기본" },
  { value: "self_hp", label: "내 HP", group: "내 상태" },
  { value: "enemy_hp", label: "적 HP", group: "적 상태" },
] as const;

describe("combat pattern choice controls", () => {
  it("filters choice labels and groups with Korean search text", () => {
    expect(filterPatternChoiceOptions(OPTIONS, "HP").map((item) => item.value))
      .toEqual(["self_hp", "enemy_hp"]);
    expect(filterPatternChoiceOptions(OPTIONS, "내 상태")).toEqual([
      OPTIONS[1],
    ]);
  });

  it("renders the selected condition as a dialog picker instead of a select", () => {
    const html = renderToStaticMarkup(
      <PatternChoicePicker
        value="self_hp"
        options={OPTIONS}
        label="행동 조건 선택"
        onChange={vi.fn()}
      />,
    );

    expect(html).toContain("내 HP");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain("<select");
  });

  it("renders short choices as an accessible segmented radio group", () => {
    const html = renderToStaticMarkup(
      <PatternChoiceButtons
        value="below"
        options={[
          { value: "below", label: "이하" },
          { value: "above", label: "이상" },
        ]}
        label="수치 비교 방식"
        onChange={vi.fn()}
      />,
    );

    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain("이하");
    expect(html).toContain("이상");
  });

  it("renders the selected action skill as a large dialog trigger", () => {
    const html = renderToStaticMarkup(
      <SkillPatternPicker
        value="v2_skill_strike"
        choices={[{ value: "v2_skill_strike" }]}
        onChange={vi.fn()}
      />,
    );

    expect(html).toContain("강타");
    expect(html).toContain("변경");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain("<select");
  });

  it("shows skill descriptions and combat details in the action skill list", () => {
    const html = renderToStaticMarkup(
      <SkillPatternChoiceList
        value="v2_skill_strike"
        choices={[
          { value: "v2_skill_strike" },
          { value: "v2_skill_recover", unavailable: true },
        ]}
        onSelect={vi.fn()}
      />,
    );

    expect(html).toContain('role="listbox"');
    expect(html).toContain("강타");
    expect(html).toContain("힘을 실어 적에게 추가 피해를 준다.");
    expect(html).toContain("발동 100%");
    expect(html).toContain("MP ");
    expect(html).toContain("회복");
    expect(html).toContain("미장착");
    expect(html).toContain("현재 장착되지 않아 전투에서는 발동하지 않습니다.");
  });
});
