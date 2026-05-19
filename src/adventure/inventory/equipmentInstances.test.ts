import { describe, expect, it } from "vitest";
import { ENHANCE_MAX_LEVEL } from "@/adventure/character/enhancement";
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
