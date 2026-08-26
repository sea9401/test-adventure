import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  ACTION_KIND_OPTIONS,
  COMBAT_PATTERN_CONDITION_OPTIONS,
  PatternChoiceButtons,
  PatternChoicePicker,
  ConditionParams,
  SkillPatternChoiceList,
  SkillPatternPicker,
  V2CombatPatternView,
  ENEMY_DEBUFF_OPTIONS,
  combatPatternSkillChoices,
  filterPatternChoiceOptions,
  resonanceMaterialSkillIds,
} from "./V2CombatPatternView";

const OPTIONS = [
  { value: "always", label: "항상", group: "기본" },
  { value: "self_hp", label: "내 HP", group: "내 상태" },
  { value: "enemy_hp", label: "적 HP", group: "적 상태" },
] as const;

describe("combat pattern choice controls", () => {
  it("행동 방식에서 일반 공격을 직접 선택할 수 있다", () => {
    const html = renderToStaticMarkup(
      <PatternChoiceButtons
        value="basic_attack"
        options={ACTION_KIND_OPTIONS}
        label="행동 방식"
        onChange={vi.fn()}
      />,
    );

    expect(html).toContain("일반 공격");
    expect(html).toContain('aria-checked="true"');
  });

  it("서로 다른 스킬의 독립 판정과 중복 스킬의 공유 판정을 안내한다", () => {
    const html = renderToStaticMarkup(<V2CombatPatternView onBack={vi.fn()} />);

    expect(html).toContain("발동률 판정에 실패하면 다음");
    expect(html).toContain("서로 다른 스킬은 독립적으로 판정");
    expect(html).toContain("중복 배치해도");
  });

  it("AND/OR 복합 조건의 의미와 혈전 조합 예시를 안내한다", () => {
    const page = renderToStaticMarkup(
      <V2CombatPatternView onBack={vi.fn()} />,
    );
    const andEditor = renderToStaticMarkup(
      <ConditionParams
        condition={{
          kind: "all",
          conditions: [
            { kind: "self_hp", op: "above", pct: 50 },
            {
              kind: "self_buff_pct",
              target: "berserkerFinisher",
              active: false,
            },
          ],
        }}
        onChange={vi.fn()}
      />,
    );

    expect(page).toContain("AND (모두 만족)");
    expect(page).toContain("내 HP 50% 이상");
    expect(page).toContain("혈전 준비 없음");
    expect(andEditor).toContain("모든 하위 조건");
  });

  it("적 디버프 선택지에 상대 회복 감소를 표시한다", () => {
    expect(ENEMY_DEBUFF_OPTIONS).toContainEqual({
      value: "healReduction",
      label: "회복 효과 감소",
    });
  });

  it("적 디버프 선택지에 모든 능력치 감소를 표시한다", () => {
    expect(ENEMY_DEBUFF_OPTIONS).toEqual(
      expect.arrayContaining([
        { value: "str", label: "힘 감소" },
        { value: "dex", label: "민첩 감소" },
        { value: "vit", label: "활력 감소" },
        { value: "spd", label: "속도 감소" },
        { value: "luk", label: "행운 감소" },
        { value: "int", label: "지능 감소" },
      ]),
    );

    const html = renderToStaticMarkup(
      <ConditionParams
        condition={
          {
            kind: "enemy_debuff",
            target: "vit",
            active: true,
          } as React.ComponentProps<typeof ConditionParams>["condition"]
        }
        onChange={vi.fn()}
      />,
    );
    expect(html).toContain("활력 감소");
    expect(html).toContain("있을 때");
  });

  it("filters choice labels and groups with Korean search text", () => {
    expect(filterPatternChoiceOptions(OPTIONS, "HP").map((item) => item.value))
      .toEqual(["self_hp", "enemy_hp"]);
    expect(filterPatternChoiceOptions(OPTIONS, "내 상태")).toEqual([
      OPTIONS[1],
    ]);
  });

  it("실제 복합 조건 선택지를 AND와 OR로 검색할 수 있다", () => {
    expect(
      filterPatternChoiceOptions(COMBAT_PATTERN_CONDITION_OPTIONS, "AND").map(
        (item) => item.value,
      ),
    ).toEqual(["all"]);
    expect(
      filterPatternChoiceOptions(COMBAT_PATTERN_CONDITION_OPTIONS, "OR").map(
        (item) => item.value,
      ),
    ).toEqual(["any"]);
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

  it("전투 자원 조건은 충격·철벽 반사·각인·중량만 표시한다", () => {
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
    );

    expect(html).toContain("충격");
    expect(html).toContain("철벽 반사");
    expect(html).toContain("각인 총합");
    expect(html).toContain("중량");
    expect(html).not.toContain("분열체");
    expect(html).toContain('max="8"');
    expect(html).toContain("없을 때");
    expect(html).toContain("이상");
    expect(html).toContain('value="3"');
  });

  it("한기 조건은 5스택 상한을 표시한다", () => {
    const html = renderToStaticMarkup(
      <ConditionParams
        condition={{
          kind: "enemy_status",
          tag: "frostChill",
          op: "atLeast",
          stacks: 4,
        }}
        onChange={vi.fn()}
      />,
    );

    expect(html).toContain("한기");
    expect(html).toContain('max="5"');
    expect(html).toContain('value="4"');
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

  it("공명 재료는 새 선택지에서 제외하고 기존 블록에서만 비활성 상태로 보존한다", () => {
    expect(
      combatPatternSkillChoices({
        castableEquipped: [
          "v2c_elementallord_surge",
          "v2c_frostmage_glacier",
          "v2c_lightningmage_thunderbolt",
          "v2c_mage_boltcast",
        ],
        currentSkillId: "v2c_frostmage_glacier",
        resonanceMaterialIds: new Set([
          "v2c_frostmage_glacier",
          "v2c_lightningmage_thunderbolt",
        ]),
      }),
    ).toEqual([
      { value: "v2c_frostmage_glacier", resonanceMaterial: true },
      { value: "v2c_elementallord_surge" },
      { value: "v2c_mage_boltcast" },
    ]);
  });

  it("상태 응답의 공명 역할에서 개별 발동 불가 스킬만 식별한다", () => {
    expect([
      ...resonanceMaterialSkillIds([
        {
          skillId: "v2c_elementallord_surge",
          resonanceRole: "inactive",
        },
        {
          skillId: "v2c_frostmage_glacier",
          resonanceRole: "material",
        },
        {
          skillId: "v2c_lightningmage_thunderbolt",
          resonanceRole: "material",
        },
        {
          skillId: "v2c_mage_boltcast",
        },
      ]),
    ]).toEqual([
      "v2c_frostmage_glacier",
      "v2c_lightningmage_thunderbolt",
    ]);
  });

  it("기존 공명 재료 블록에 개별 발동 불가 사유를 표시하고 선택을 막는다", () => {
    const choices = [
      {
        value: "v2c_frostmage_glacier",
        resonanceMaterial: true,
      },
    ] as unknown as React.ComponentProps<
      typeof SkillPatternChoiceList
    >["choices"];
    const html = renderToStaticMarkup(
      <SkillPatternChoiceList
        value="v2c_frostmage_glacier"
        choices={choices}
        onSelect={vi.fn()}
      />,
    );

    expect(html).toContain("공명 재료");
    expect(html).toContain("상위 원소 스킬에 흡수되어 개별 발동하지 않습니다.");
    expect(html).toContain("disabled=\"\"");
  });
});
