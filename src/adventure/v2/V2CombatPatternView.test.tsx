import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  PatternChoiceButtons,
  PatternChoicePicker,
  ConditionParams,
  SkillPatternChoiceList,
  SkillPatternPicker,
  V2CombatPatternView,
  ENEMY_DEBUFF_OPTIONS,
  filterPatternChoiceOptions,
} from "./V2CombatPatternView";

const OPTIONS = [
  { value: "always", label: "항상", group: "기본" },
  { value: "self_hp", label: "내 HP", group: "내 상태" },
  { value: "enemy_hp", label: "적 HP", group: "적 상태" },
] as const;

describe("combat pattern choice controls", () => {
  it("발동 실패의 다음 순위 검사와 중복 스킬의 공유 판정을 안내한다", () => {
    const html = renderToStaticMarkup(<V2CombatPatternView onBack={vi.fn()} />);

    expect(html).toContain("발동률 판정에 실패하면 다음");
    expect(html).toContain("같은 판정값을 공유");
    expect(html).toContain("중복 배치해도");
  });

  it("적 디버프 선택지에 상대 회복 감소를 표시한다", () => {
    expect(ENEMY_DEBUFF_OPTIONS).toContainEqual({
      value: "healReduction",
      label: "회복 효과 감소",
    });
  });

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

  it("보호막 수치 조건은 있음·없음과 이하·이상 선택 및 기준값을 표시한다", () => {
    const html = renderToStaticMarkup(
      <ConditionParams
        condition={{ kind: "self_shield", op: "atMost", value: 100 }}
        onChange={vi.fn()}
      />,
    );

    expect(html).toContain("없을 때");
    expect(html).toContain("있을 때");
    expect(html).toContain("이하");
    expect(html).toContain("이상");
    expect(html).toContain('value="100"');
  });

  it("전투 자원 조건은 충격·철벽 반사·각인·중량·분열체와 비교 기준을 표시한다", () => {
    const html = renderToStaticMarkup(
      <ConditionParams
        condition={{
          kind: "self_resource",
          resource: "impact",
          op: "atLeast",
          value: 3,
        }}
        onChange={vi.fn()}
      />,
    ) + renderToStaticMarkup(
      <ConditionParams
        condition={{
          kind: "self_resource",
          resource: "ironWallReflect",
          op: "none",
          value: 0,
        }}
        onChange={vi.fn()}
      />,
    ) + renderToStaticMarkup(
      <ConditionParams
        condition={{
          kind: "self_resource",
          resource: "inscription",
          op: "atLeast",
          value: 4,
        }}
        onChange={vi.fn()}
      />,
    ) + renderToStaticMarkup(
      <ConditionParams
        condition={{
          kind: "self_resource",
          resource: "weight",
          op: "atLeast",
          value: 3,
        }}
        onChange={vi.fn()}
      />,
    ) + renderToStaticMarkup(
      <ConditionParams
        condition={{
          kind: "self_resource",
          resource: "split",
          op: "atMost",
          value: 1,
        }}
        onChange={vi.fn()}
      />,
    );

    expect(html).toContain("충격");
    expect(html).toContain("철벽 반사");
    expect(html).toContain("각인 총합");
    expect(html).toContain("중량");
    expect(html).toContain("분열체");
    expect(html).toContain('max="8"');
    expect(html).toContain("없을 때");
    expect(html).toContain("이상");
    expect(html).toContain('value="3"');
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
