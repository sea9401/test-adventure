import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  PatternChoiceButtons,
  PatternChoicePicker,
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
});
