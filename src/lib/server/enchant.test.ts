import { describe, expect, it } from "vitest";
import { EnchantError, computeEnchantOutcome } from "./enchant";
import type { EquipmentInstance } from "@/adventure/inventory/equipmentInstances";

const inst = (
  instanceId: string,
  enhancementLevel: number,
  enchantSlots?: EquipmentInstance["enchantSlots"],
  itemId: EquipmentInstance["itemId"] = "starlit_greatsword_str",
): EquipmentInstance => ({
  instanceId,
  itemId,
  enhancementLevel,
  remainingAttempts: 7,
  ...(enchantSlots ? { enchantSlots } : {}),
});

// 결정적 RNG — 항상 0 이면 range 최솟값, 1 직전이면 최댓값.
const rngMin = () => 0;
const rngMax = () => 0.999;

describe("computeEnchantOutcome — 슬롯 capacity 검증", () => {
  it("+2 자루는 슬롯 1개 부여 가능", () => {
    const out = computeEnchantOutcome(
      {
        materials: { enchant_guard: 1 },
        equipmentInstances: [inst("a", 2)],
      },
      "a",
      "enchant_guard",
      rngMin,
    );
    expect(out.materials).toEqual({}); // 마지막 1장 소비 → 키 삭제
    expect(out.equipmentInstances[0].enchantSlots).toEqual([
      { affixId: "guard", value: 5 }, // range [5,20] 최솟값
    ]);
    expect(out.slot).toEqual({ affixId: "guard", value: 5 });
  });

  it("+1 자루는 슬롯 미해금 — no_slot_unlocked", () => {
    expect(() =>
      computeEnchantOutcome(
        {
          materials: { enchant_guard: 1 },
          equipmentInstances: [inst("a", 1)],
        },
        "a",
        "enchant_guard",
        rngMin,
      ),
    ).toThrow(EnchantError);
  });

  it("이미 가득 찬 슬롯엔 부여 불가 — slots_full", () => {
    expect(() =>
      computeEnchantOutcome(
        {
          materials: { enchant_dodge: 1 },
          equipmentInstances: [
            inst("a", 2, [{ affixId: "guard", value: 10 }]),
          ],
        },
        "a",
        "enchant_dodge",
        rngMin,
      ),
    ).toThrow(/slots_full/);
  });

  it("+4 자루는 2슬롯 — 첫 슬롯 박힌 자루에 두 번째 부여 가능", () => {
    const out = computeEnchantOutcome(
      {
        materials: { enchant_dodge: 2 },
        equipmentInstances: [
          inst("a", 4, [{ affixId: "guard", value: 10 }]),
        ],
      },
      "a",
      "enchant_dodge",
      rngMax,
    );
    expect(out.materials).toEqual({ enchant_dodge: 1 });
    expect(out.equipmentInstances[0].enchantSlots).toEqual([
      { affixId: "guard", value: 10 },
      { affixId: "dodge", value: 12 }, // range [3,12] 최댓값
    ]);
  });
});

describe("computeEnchantOutcome — 입력 검증", () => {
  it("부여서 미보유 — missing_scroll", () => {
    expect(() =>
      computeEnchantOutcome(
        {
          materials: {},
          equipmentInstances: [inst("a", 2)],
        },
        "a",
        "enchant_guard",
        rngMin,
      ),
    ).toThrow(/missing_scroll/);
  });

  it("자루 없음 — instance_not_found", () => {
    expect(() =>
      computeEnchantOutcome(
        {
          materials: { enchant_guard: 1 },
          equipmentInstances: [],
        },
        "missing",
        "enchant_guard",
        rngMin,
      ),
    ).toThrow(/instance_not_found/);
  });

  it("부여서 컨벤션 위반 materialId — invalid_affix", () => {
    expect(() =>
      computeEnchantOutcome(
        {
          materials: { starfall_shard: 100 },
          equipmentInstances: [inst("a", 2)],
        },
        "a",
        "starfall_shard",
        rngMin,
      ),
    ).toThrow(/invalid_affix/);
  });
});

describe("computeEnchantOutcome — RNG 값 굴림", () => {
  it("range 안 정수 — rng 0 → min, rng 0.999 → max", () => {
    const low = computeEnchantOutcome(
      {
        materials: { enchant_might: 1 },
        equipmentInstances: [inst("a", 2)],
      },
      "a",
      "enchant_might",
      rngMin,
    );
    expect(low.slot.value).toBe(3); // range [3,10]
    const high = computeEnchantOutcome(
      {
        materials: { enchant_might: 1 },
        equipmentInstances: [inst("a", 2)],
      },
      "a",
      "enchant_might",
      rngMax,
    );
    expect(high.slot.value).toBe(10);
  });
});
