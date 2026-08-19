import { describe, expect, it } from "vitest";
import type { V2SkillId } from "./v2Skills";
import { resolveElementalResonanceLoadout } from "./elementalResonance";

const MATERIALS = [
  "v2c_firemage_inferno",
  "v2c_frostmage_glacier",
  "v2c_lightningmage_thunderbolt",
  "v2c_windmage_tempest",
  "v2c_earthmage_tectonic",
] as const satisfies readonly V2SkillId[];

const ELEMENTAL_LORD = [
  ...MATERIALS,
  "v2c_elementallord_surge",
  "v2c_elementallord_resonance",
] as const satisfies readonly V2SkillId[];

const PRIMORDIAL = [
  ...MATERIALS,
  "v2c_primordialmage_return",
  "v2c_primordialmage_resonance",
] as const satisfies readonly V2SkillId[];

describe("원소 공명 로드아웃 해석", () => {
  it("완성 회로와 선택 주문식에 맞춰 승인된 총 SP를 계산한다", () => {
    expect(
      resolveElementalResonanceLoadout({
        learned: ELEMENTAL_LORD,
        equipped: ELEMENTAL_LORD,
      }).spUsed,
    ).toBe(28);
    expect(
      resolveElementalResonanceLoadout({
        learned: PRIMORDIAL,
        equipped: PRIMORDIAL,
      }).spUsed,
    ).toBe(30);

    const catalyst = [...PRIMORDIAL, "v2c_elementallord_surge"] as const;
    expect(
      resolveElementalResonanceLoadout({ learned: catalyst, equipped: catalyst }).spUsed,
    ).toBe(31);
    expect(
      resolveElementalResonanceLoadout({
        learned: [...catalyst, "v2c_primordialmage_amplification"],
        equipped: [...catalyst, "v2c_primordialmage_amplification"],
      }).spUsed,
    ).toBe(40);
  });

  it("선택된 복합 주문식의 재료만 흡수하고 남는 원소는 기본 비용과 시전권을 유지한다", () => {
    const equipped = [
      "v2c_elementallord_surge",
      "v2c_elementallord_resonance",
      "v2c_firemage_inferno",
      "v2c_windmage_tempest",
      "v2c_frostmage_glacier",
    ] as const;
    const resolved = resolveElementalResonanceLoadout({ learned: equipped, equipped });

    expect(resolved.castVariant?.name).toBe("화염폭풍");
    expect(resolved.absorbedSkillIds).toEqual([
      "v2c_firemage_inferno",
      "v2c_windmage_tempest",
    ]);
    expect(resolved.effectiveSpCosts.get("v2c_firemage_inferno")).toBe(2);
    expect(resolved.effectiveSpCosts.get("v2c_windmage_tempest")).toBe(2);
    expect(resolved.effectiveSpCosts.get("v2c_frostmage_glacier")).toBe(7);
    expect(resolved.activeCombatSkillIds).toContain("v2c_frostmage_glacier");
    expect(resolved.activeCombatSkillIds).not.toContain("v2c_firemage_inferno");
    expect(resolved.spUsed).toBe(29);
  });

  it("보유만으로 해금한 주문식은 장착 재료를 흡수하지 않는다", () => {
    const equipped = [
      "v2c_elementallord_surge",
      "v2c_elementallord_resonance",
    ] as const;
    const resolved = resolveElementalResonanceLoadout({
      learned: ELEMENTAL_LORD,
      equipped,
    });

    expect(resolved.castVariant?.name).toBe("오원소 대폭주");
    expect(resolved.absorbedSkillIds).toEqual([]);
    expect(resolved.spUsed).toBe(18);
  });

  it("공명 패시브가 빠진 회로에는 비용과 시전 흡수를 적용하지 않는다", () => {
    const equipped = ["v2c_elementallord_surge", ...MATERIALS] as const;
    const resolved = resolveElementalResonanceLoadout({ learned: equipped, equipped });

    expect(resolved.circuit).toBe("none");
    expect(resolved.absorbedSkillIds).toEqual([]);
    expect(resolved.spUsed).toBe(50);
    expect(resolved.activeCombatSkillIds).toEqual(equipped);
  });

  it("두 회로가 모두 완성되면 근원공명을 우선하고 폭주를 촉매로 흡수한다", () => {
    const equipped = [
      ...ELEMENTAL_LORD,
      "v2c_primordialmage_return",
      "v2c_primordialmage_resonance",
    ] as const;
    const resolved = resolveElementalResonanceLoadout({ learned: equipped, equipped });

    expect(resolved.circuit).toBe("primordial");
    expect(resolved.castVariant?.name).toBe("개벽·오원소 회귀");
    expect(resolved.catalystActive).toBe(true);
    expect(resolved.effectiveSpCosts.get("v2c_firemage_inferno")).toBe(1);
    expect(resolved.effectiveSpCosts.get("v2c_elementallord_surge")).toBe(1);
    expect(resolved.activeCombatSkillIds).not.toContain("v2c_elementallord_surge");
  });
});
