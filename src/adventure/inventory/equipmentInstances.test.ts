import { describe, expect, it } from "vitest";
import {
  ENHANCE_MAX_LEVEL,
  resolveEnhancedItem,
} from "@/adventure/character/enhancement";
import { normalizeInstance, normalizeInstances } from "./equipmentInstances";

describe("normalizeInstance", () => {
  const valid = {
    instanceId: "inst-1",
    itemId: "starlit_greatsword_str",
    enhancementLevel: 3,
  };

  it("정상 인스턴스는 통과 (옛 인스턴스 fallback — safe N 회 history + 가능 횟수 7)", () => {
    expect(normalizeInstance(valid)).toEqual({
      instanceId: "inst-1",
      itemId: "starlit_greatsword_str",
      enhancementLevel: 3,
      craftTier: undefined,
      enhanceHistory: ["safe", "safe", "safe"],
      remainingAttempts: 7,
    });
  });

  it("enhanceHistory + remainingAttempts 명시된 신규 인스턴스 통과", () => {
    const fresh = {
      instanceId: "fresh",
      itemId: "starlit_greatsword_str",
      enhancementLevel: 2,
      enhanceHistory: ["boost", "high"],
      remainingAttempts: 5,
    };
    expect(normalizeInstance(fresh)).toEqual({
      instanceId: "fresh",
      itemId: "starlit_greatsword_str",
      enhancementLevel: 2,
      craftTier: undefined,
      enhanceHistory: ["boost", "high"],
      remainingAttempts: 5,
    });
  });

  it("enhanceHistory 길이 mismatch — drop", () => {
    expect(
      normalizeInstance({
        ...valid,
        enhanceHistory: ["safe"], // level 3 인데 길이 1
      }),
    ).toBeNull();
  });

  it("enhanceHistory 에 알 수 없는 모드 — drop", () => {
    expect(
      normalizeInstance({
        ...valid,
        enhanceHistory: ["safe", "wat", "safe"],
      }),
    ).toBeNull();
  });

  it("remainingAttempts 가 INITIAL(7) 초과 — drop", () => {
    expect(
      normalizeInstance({ ...valid, remainingAttempts: 999 }),
    ).toBeNull();
  });

  it("enhancementLevel 가 MAX 초과면 drop", () => {
    const forged = { ...valid, enhancementLevel: ENHANCE_MAX_LEVEL + 1 };
    expect(normalizeInstance(forged)).toBeNull();
  });

  it("enhancementLevel = MAX 는 통과 (경계값)", () => {
    const ok = { ...valid, enhancementLevel: ENHANCE_MAX_LEVEL };
    expect(normalizeInstance(ok)?.enhancementLevel).toBe(ENHANCE_MAX_LEVEL);
  });

  it("enhancementLevel 가 음수면 drop", () => {
    expect(normalizeInstance({ ...valid, enhancementLevel: -1 })).toBeNull();
  });

  it("enhancementLevel 가 비정수면 drop", () => {
    expect(normalizeInstance({ ...valid, enhancementLevel: 2.5 })).toBeNull();
  });

  it("instanceId 빈 문자열은 drop", () => {
    expect(normalizeInstance({ ...valid, instanceId: "" })).toBeNull();
  });

  it("itemId 누락은 drop", () => {
    expect(normalizeInstance({ ...valid, itemId: undefined as never })).toBeNull();
  });

  it("itemId 가 ENHANCEABLE_ITEM_IDS 밖이면 drop (위조 인스턴스 차단)", () => {
    // 일반 장비 (강화 대상 아님) id 가 박힌 인스턴스.
    expect(
      normalizeInstance({ ...valid, itemId: "bandit_dagger" }),
    ).toBeNull();
    // 존재하지 않는 itemId.
    expect(
      normalizeInstance({ ...valid, itemId: "totally_fake_id" }),
    ).toBeNull();
  });
});

describe("normalizeInstances", () => {
  it("forged level 999 인스턴스는 빠지고 정상만 남는다", () => {
    const out = normalizeInstances([
      { instanceId: "a", itemId: "starlit_greatsword_str", enhancementLevel: 3 },
      { instanceId: "b", itemId: "starlit_lance_dex", enhancementLevel: 999 },
      { instanceId: "c", itemId: "starlit_shield_vit", enhancementLevel: 0 },
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((x) => x.instanceId)).toEqual(["a", "c"]);
  });

  it("중복 instanceId 는 한 번만", () => {
    const out = normalizeInstances([
      { instanceId: "dup", itemId: "starlit_greatsword_str", enhancementLevel: 1 },
      { instanceId: "dup", itemId: "starlit_lance_dex", enhancementLevel: 2 },
    ]);
    expect(out).toHaveLength(1);
  });
});

// 마법부여(enchant) 슬롯 데이터가 로드/normalize 에서 손실되지 않는지 가드.
// 룬 carry-through(#448) 와 같은 계열의 "비파괴 로드" 회귀 방지 — 단, enchant 는
// 의도적으로 "자루 통째 drop" 정책이므로, 그 drop 동작 자체를 명시적으로 못박아
// 카탈로그/range/capacity 를 바꾸는 PR 이 기존 데이터를 조용히 날리면 CI 가 잡게 한다.
describe("normalizeInstance — enchantSlots 보존/드롭 가드", () => {
  // guard affix range [5,20]. enhancementLevel 7 → capacity 3.
  const enchanted = {
    instanceId: "ench-1",
    itemId: "starlit_greatsword_str",
    enhancementLevel: 7,
    enhanceHistory: ["safe", "safe", "safe", "safe", "safe", "safe", "safe"],
    remainingAttempts: 7,
    enchantSlots: [
      { affixId: "guard", value: 10 },
      { affixId: "dodge", value: 8 },
    ],
  };

  it("정상 enchantSlots 는 round-trip 보존", () => {
    expect(normalizeInstance(enchanted)?.enchantSlots).toEqual([
      { affixId: "guard", value: 10 },
      { affixId: "dodge", value: 8 },
    ]);
  });

  // 아래 3건은 "현재 통째 drop" 동작을 고정하는 tripwire — 카탈로그/range/capacity 를
  // 바꿔 기존 자루가 사라지게 되면 여기가 깨지면서 의식적 결정을 강제한다.
  it("[tripwire] 미인식 affixId → 자루 통째 drop", () => {
    expect(
      normalizeInstance({
        ...enchanted,
        enchantSlots: [{ affixId: "no_such_affix", value: 10 }],
      }),
    ).toBeNull();
  });

  it("[tripwire] range 밖 value → 자루 통째 drop", () => {
    expect(
      normalizeInstance({
        ...enchanted,
        enchantSlots: [{ affixId: "guard", value: 999 }],
      }),
    ).toBeNull();
  });

  it("[tripwire] capacity 초과 (lv2=cap1 인데 2슬롯) → 자루 통째 drop", () => {
    expect(
      normalizeInstance({
        instanceId: "over",
        itemId: "starlit_greatsword_str",
        enhancementLevel: 2,
        enhanceHistory: ["safe", "safe"],
        remainingAttempts: 7,
        enchantSlots: [
          { affixId: "guard", value: 10 },
          { affixId: "dodge", value: 8 },
        ],
      }),
    ).toBeNull();
  });

  // #447 회귀 가드 — 장착→해제 round-trip 에서 마법부여가 사라지던 버그.
  // resolveEnhancedItem(인스턴스→EquippedItem) 가 enchantSlots 를 실어주고,
  // 해제 시 그 메타로 풀에 복원(normalizeInstance)했을 때 그대로 보존돼야 한다.
  it("[#447] 장착→해제 round-trip 후 enchantSlots/history/attempts 보존", () => {
    const inst = normalizeInstance(enchanted);
    expect(inst).not.toBeNull();
    if (!inst) return;

    // 장착: 인스턴스 메타 → EquippedItem.
    const equipped = resolveEnhancedItem(
      inst.itemId,
      inst.craftTier,
      inst.enhanceHistory ?? inst.enhancementLevel,
      inst.instanceId,
      inst.enchantSlots,
      inst.remainingAttempts,
    );
    expect(equipped.enchantSlots).toEqual(inst.enchantSlots);

    // 해제: EquippedItem 메타로 풀 복원 (useEquipmentActions.returnEquippedToInventory 와 동일 매핑).
    const restored = normalizeInstance({
      instanceId: equipped.instanceId,
      itemId: inst.itemId,
      craftTier: equipped.craftTier,
      enhancementLevel: equipped.enhancementLevel,
      enhanceHistory: equipped.enhanceHistory,
      remainingAttempts: equipped.remainingAttempts,
      enchantSlots: equipped.enchantSlots,
    });
    expect(restored?.enchantSlots).toEqual(enchanted.enchantSlots);
    expect(restored?.enhanceHistory).toEqual(enchanted.enhanceHistory);
    expect(restored?.remainingAttempts).toBe(enchanted.remainingAttempts);
  });
});
