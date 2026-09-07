import { describe, expect, it } from "vitest";
import {
  equippedPassiveSummary,
  isConditionalPassiveSkill,
  skillLibraryTags,
} from "./skillLibraryPresentation";

describe("skillLibraryTags", () => {
  it("간략 카드가 기존 빌드 태그 순서에서 요청한 개수만 표시한다", () => {
    expect(skillLibraryTags("v2c_warrior_strike", 2)).toEqual([
      "STR",
      "물리",
    ]);
  });

  it("알 수 없는 스킬과 0개 제한은 빈 태그를 반환한다", () => {
    expect(skillLibraryTags("missing", 3)).toEqual([]);
    expect(skillLibraryTags("v2c_warrior_strike", 0)).toEqual([]);
  });
});

describe("equippedPassiveSummary", () => {
  it("실제 전투 집계 규칙으로 장착 패시브의 같은 스탯을 합산한다", () => {
    const summary = equippedPassiveSummary([
      "v2c_warrior_might",
      "v2c_squire_might",
    ]);

    expect(summary).toContainEqual({
      id: "statPct:str",
      label: "힘 +25%",
      conditional: false,
    });
  });

  it("스택에 따라 달라지는 합산 효과를 조건부로 표시한다", () => {
    const summary = equippedPassiveSummary([
      "v2c_beastkin_bloodscent",
    ]);

    expect(summary).toContainEqual({
      id: "bleedPhysicalSkillDamagePctPerStack",
      label: "대상 출혈 스택당 물리 스킬 피해 +2%",
      conditional: true,
    });
  });

  it("자원·방어·흡혈 합계를 각각 읽을 수 있는 수치로 표시한다", () => {
    const summary = equippedPassiveSummary(["v2c_bloodlord_martyrdom"]);

    expect(summary).toEqual(
      expect.arrayContaining([
        { id: "maxHpPct", label: "최대 HP +20%", conditional: false },
        { id: "lifestealPct", label: "흡혈 +2%", conditional: false },
        {
          id: "damageTakenReductionPct",
          label: "받는 피해 -8%",
          conditional: false,
        },
      ]),
    );
  });

  it("확률 합성과 활성화형 패시브도 집계 결과를 표시한다", () => {
    const summary = equippedPassiveSummary([
      "v2c_caster_acumen",
      "v2c_battlemonk_counter",
      "v2c_adamantmonk_body",
    ]);

    expect(summary).toEqual(
      expect.arrayContaining([
        {
          id: "counterChancePct",
          label: "HP 피해 시 반격 확률 54.5%",
          conditional: true,
        },
        {
          id: "magicBarrier",
          label: "마나 실드 활성화",
          conditional: false,
        },
      ]),
    );
  });

  it("전투 초반에만 적용되는 합계에 조건과 횟수를 함께 표시한다", () => {
    const summary = equippedPassiveSummary(["v2c_warder_ward"]);

    expect(summary).toContainEqual({
      id: "openingMagicDamageReductionPct",
      label: "초반 적 공격 3회 받는 마법 피해 -10%",
      conditional: true,
    });
  });

  it("패시브가 없거나 알 수 없는 ID만 있으면 빈 요약을 반환한다", () => {
    expect(equippedPassiveSummary(["v2c_warrior_strike", "missing"])).toEqual(
      [],
    );
  });
});

describe("isConditionalPassiveSkill", () => {
  it("스택·피격·전투 구간에 의존하는 패시브만 조건부로 구분한다", () => {
    expect(isConditionalPassiveSkill("v2c_beastkin_bloodscent")).toBe(true);
    expect(isConditionalPassiveSkill("v2c_warder_ward")).toBe(true);
    expect(isConditionalPassiveSkill("v2c_warrior_might")).toBe(false);
    expect(isConditionalPassiveSkill("v2c_warrior_strike")).toBe(false);
  });
});
