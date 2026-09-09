import { describe, expect, it } from "vitest";
import { parseEquipmentSave, type V2EquipInstance } from "@/adventure/data/v2/v2Equipment";
import { enchantmentTransferCost } from "@/adventure/data/v2/equipmentEnchantmentTransfer";
import { applyEquipmentEnchantmentTransfer } from "./equipmentEnchantmentTransfer";
import { applyEquipmentLiberation } from "./equipmentLiberationService";

function source(): V2EquipInstance {
  return {
    iid: "source", id: "v2_storm_breaker_greatsword", bound: true, locked: true,
    enhance: { level: 3, bonusPct: 4 },
    liberation: { rank: 2, lineCount: 2, revision: 8, options: [
      { id: "physical_attack_flat", level: 8 },
      { id: "magic_attack_flat", level: 6 },
    ] },
  };
}
function target(): V2EquipInstance {
  return { iid: "target", id: "v2_storm_breaker_greatsword", enhance: { level: 2, bonusPct: 2 } };
}
function args() {
  return {
    character: { gold: 20_000_000, bankedGold: 100_000_000, preserved: "yes" },
    equipment: { owned: [source(), target()], equipped: { weapon: "source" } },
    sourceIid: "source", targetIid: "target", expectedSourceRevision: 8, expectedTargetRevision: 0,
  };
}

describe("마법부여 전체 이전", () => {
  it.each([
    [3, 1, 15_000_000], [3, 2, 22_500_000], [3, 3, 30_000_000],
    [2, 1, 30_000_000], [2, 2, 45_000_000], [2, 3, 60_000_000],
    [1, 1, 50_000_000], [1, 2, 75_000_000], [1, 3, 100_000_000],
  ] as const)("내부 등급 %s / %s줄은 %s G", (rank, lineCount, cost) => {
    const price = enchantmentTransferCost({ rank, lineCount });
    expect(price.goldCost).toBe(cost);
    expect(price.baseGoldCost + price.additionalGoldCost).toBe(cost);
  });

  it("원본 장비·귀속·강화·잠금·장착은 유지하고 옵션 전체를 대상에 이전한다", () => {
    const input = args();
    const before = structuredClone(input);
    const result = applyEquipmentEnchantmentTransfer(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toMatchObject({ iid: "source", bound: true, locked: true, enhance: source().enhance, liberationRevision: 9 });
    expect(result.source.liberation).toBeUndefined();
    expect(result.target).toMatchObject({ iid: "target", bound: true, enhance: target().enhance, liberationRevision: 1,
      liberation: { ...source().liberation, revision: 1 } });
    expect(result.equipment.owned).toHaveLength(2);
    expect(result.equipment.equipped).toEqual({ weapon: "source" });
    expect(result.character).toEqual({ gold: 0, bankedGold: 75_000_000, preserved: "yes" });
    expect(result.spentGold).toBe(45_000_000);
    expect(input).toEqual(before);
  });

  it("대상 기존 줄 수와 옵션을 덮어쓰고 대상 변경 번호를 증가시킨다", () => {
    const input = args();
    input.equipment.owned[1].liberation = { rank: 3, lineCount: 1, revision: 20, options: [{ id: "accuracy_flat", level: 1 }] };
    input.expectedTargetRevision = 20;
    const result = applyEquipmentEnchantmentTransfer(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.target.liberation).toEqual({ ...source().liberation, revision: 21 });
  });

  it.each(["source", "target"] as const)("%s의 오래된 확인은 차감 없이 거절한다", (which) => {
    const input = args();
    if (which === "source") input.expectedSourceRevision = 7;
    else input.expectedTargetRevision = 1;
    const before = structuredClone(input);
    expect(applyEquipmentEnchantmentTransfer(input)).toMatchObject({ ok: false, error: "stale_state", source: { iid: "source" }, target: { iid: "target" } });
    expect(input).toEqual(before);
  });

  it.each([
    ["원본 없음", "not_owned"], ["대상 없음", "not_owned"], ["같은 장비", "same_item"],
    ["다른 부위", "slot_mismatch"], ["낮은 티어", "ineligible"], ["대상 개량", "ineligible"],
    ["원본 개량", "ineligible"], ["옵션 없음", "no_enchantment"], ["골드 부족", "insufficient_gold"],
  ])("%s이면 원본과 골드를 변경하지 않는다", (scenario, error) => {
    const input = args();
    if (scenario === "원본 없음") input.sourceIid = "missing";
    if (scenario === "대상 없음") input.targetIid = "missing";
    if (scenario === "같은 장비") input.targetIid = "source";
    if (scenario === "다른 부위") input.equipment.owned[1].id = "v2_boss_catastrophe_gloves";
    if (scenario === "낮은 티어") input.equipment.owned[1].id = "v2_iron_sword";
    if (scenario === "대상 개량") input.equipment.owned[1].stormRefined = true;
    if (scenario === "원본 개량") input.equipment.owned[0].stormRefined = true;
    if (scenario === "옵션 없음") { delete input.equipment.owned[0].liberation; input.expectedSourceRevision = 0; }
    if (scenario === "골드 부족") input.character.bankedGold = 24_999_999;
    const before = structuredClone(input);
    expect(applyEquipmentEnchantmentTransfer(input)).toMatchObject({ ok: false, error });
    expect(input).toEqual(before);
  });

  it("이전 뒤 저장을 다시 읽고 재부여해도 오래된 원본 요청이 유효해지지 않는다", () => {
    const first = applyEquipmentEnchantmentTransfer(args());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const saved = parseEquipmentSave(JSON.parse(JSON.stringify(first.equipment)));
    expect(saved.owned[0].liberationRevision).toBe(9);
    const base = { character: first.character, equipment: saved, iid: "source", rng: () => 0 };
    expect(applyEquipmentLiberation({ ...base, expectedRevision: 0 })).toMatchObject({ ok: false, error: "stale_state" });
    const reapplied = applyEquipmentLiberation({ ...base, expectedRevision: 9 });
    expect(reapplied.ok).toBe(true);
    if (!reapplied.ok) return;
    expect(reapplied.item.liberation?.revision).toBe(10);
    expect(applyEquipmentEnchantmentTransfer({ ...args(), equipment: reapplied.equipment, expectedTargetRevision: 1 })).toMatchObject({ ok: false, error: "stale_state" });
  });
});
