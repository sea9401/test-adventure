// craft 서버 lib 의 순수 계산(computeCraftOutcome) 검증. DB I/O(applyCraftAction)는
// 통합 테스트 인프라가 없어 제외 — 수동 시나리오(npm run dev + Network 탭)로 검증.

import { describe, expect, it } from "vitest";
import { CraftError, computeCraftOutcome, type CraftComputeInput } from "./craft";

const base = (): CraftComputeInput => ({
  potions: {},
  materials: {},
  equipment: {},
  craftedEquipment: {},
  potionCapacityBonus: 0,
  known: [],
});

// rollCraftTier(가중치 6/22/44/22/6, 누적 불량[0,6)/하급[6,28)/일반[28,72)/고급[72,94)/걸작[94,100)):
const rngMin = () => 0.0; // → 불량(-2)
const rngMid = () => 0.5; // → 일반(0)
const rngMax = () => 0.999; // → 걸작(2)

describe("computeCraftOutcome — 검증 실패", () => {
  it("없는 레시피 → unknown_recipe", () => {
    expect(() => computeCraftOutcome(base(), "nope")).toThrow(CraftError);
    try {
      computeCraftOutcome(base(), "nope");
    } catch (e) {
      expect((e as CraftError).code).toBe("unknown_recipe");
    }
  });

  it("안 익힌 제작서 → not_learned", () => {
    const input = { ...base(), materials: { branch: 5 } };
    try {
      computeCraftOutcome(input, "baseball_bat");
    } catch (e) {
      expect((e as CraftError).code).toBe("not_learned");
    }
  });

  it("재료 부족 → missing_material", () => {
    const input = { ...base(), known: ["baseball_bat"], materials: { branch: 1 } };
    try {
      computeCraftOutcome(input, "baseball_bat");
    } catch (e) {
      expect((e as CraftError).code).toBe("missing_material");
    }
  });

  it("equip 재료 부족 → missing_ingredient", () => {
    const input = {
      ...base(),
      known: ["nailed_baseball_bat"],
      materials: { rusty_nail: 99 },
      // baseball_bat 0개
    };
    try {
      computeCraftOutcome(input, "nailed_baseball_bat");
    } catch (e) {
      expect((e as CraftError).code).toBe("missing_ingredient");
    }
  });

  it("포션 가득 → potion_full", () => {
    const input = {
      ...base(),
      known: ["potion_heal_s_dust"],
      materials: { mana_dust: 9 },
      potions: { potion_heal_s: 999 },
    };
    try {
      computeCraftOutcome(input, "potion_heal_s_dust");
    } catch (e) {
      expect((e as CraftError).code).toBe("potion_full");
    }
  });
});

describe("computeCraftOutcome — 장비 (등급 변동 있음)", () => {
  it("일반(tier 0) 결과는 equipment[] 로, 재료 차감", () => {
    const input = { ...base(), known: ["baseball_bat"], materials: { branch: 5 } };
    const out = computeCraftOutcome(input, "baseball_bat", { rng: rngMid });
    expect(out.results).toEqual([
      { kind: "equipment", itemId: "baseball_bat", tier: 0 },
    ]);
    expect(out.equipment.baseball_bat).toBe(1);
    expect(out.craftedEquipment.baseball_bat).toBeUndefined();
    expect(out.materials.branch).toBe(3); // 5 - 2
  });

  it("비-기본 등급(불량) 결과는 craftedEquipment[id][tier] 로", () => {
    const input = { ...base(), known: ["baseball_bat"], materials: { branch: 2 } };
    const out = computeCraftOutcome(input, "baseball_bat", { rng: rngMin });
    expect(out.results).toEqual([
      { kind: "equipment", itemId: "baseball_bat", tier: -2 },
    ]);
    expect(out.craftedEquipment.baseball_bat).toEqual({ "-2": 1 });
    expect(out.equipment.baseball_bat).toBeUndefined();
    expect(out.materials.branch).toBeUndefined(); // 2 - 2 = 0 → 정리됨
  });

  it("같은 등급 두 번째 제작은 카운트 누적", () => {
    const input = {
      ...base(),
      known: ["baseball_bat"],
      materials: { branch: 4 },
      craftedEquipment: { baseball_bat: { "2": 1 } },
    };
    const out = computeCraftOutcome(input, "baseball_bat", { rng: rngMax });
    expect(out.craftedEquipment.baseball_bat).toEqual({ "2": 2 });
  });

  it("equip 재료는 무등급(equipment) 먼저, 모자라면 낮은 등급부터 소비", () => {
    const input = {
      ...base(),
      known: ["nailed_baseball_bat"],
      materials: { rusty_nail: 28 },
      equipment: {},
      craftedEquipment: { baseball_bat: { "-1": 1, "2": 1 } },
    };
    const out = computeCraftOutcome(input, "nailed_baseball_bat", { rng: rngMid });
    // baseball_bat ×1 소비 — 낮은 등급("-1")부터 → "2" 만 남음
    expect(out.craftedEquipment.baseball_bat).toEqual({ "2": 1 });
    expect(out.results[0].kind).toBe("equipment");
    expect(out.materials.rusty_nail).toBeUndefined(); // 28 - 28 = 0
  });

  it("equip 재료 — 제작산이 다 떨어지면 드랍 고품질에서 소비", () => {
    const input = {
      ...base(),
      known: ["nailed_baseball_bat"],
      materials: { rusty_nail: 28 },
      equipment: {},
      craftedEquipment: {},
      droppedEquipment: { baseball_bat: { "1": 1, "2": 1 } },
    };
    const out = computeCraftOutcome(input, "nailed_baseball_bat", { rng: rngMid });
    // baseball_bat ×1 소비 — 낮은 품질("1")부터 → "2" 만 남음
    expect(out.droppedEquipment.baseball_bat).toEqual({ "2": 1 });
    expect(out.results[0].kind).toBe("equipment");
  });

  it("equip 재료 — equipment + droppedEquipment 합산이 모자라면 missing_ingredient", () => {
    const input = {
      ...base(),
      known: ["nailed_baseball_bat"],
      materials: { rusty_nail: 28 },
      droppedEquipment: { baseball_bat: {} },
    };
    expect(() =>
      computeCraftOutcome(input, "nailed_baseball_bat", { rng: rngMid }),
    ).toThrow(/missing_ingredient/);
  });
});

describe("computeCraftOutcome — 포션 (변동 없음)", () => {
  it("포션 결과는 항상 그대로, tier 개념 없음", () => {
    const input = {
      ...base(),
      known: ["potion_heal_s_dust"],
      materials: { mana_dust: 5 },
    };
    const out = computeCraftOutcome(input, "potion_heal_s_dust", { rng: rngMax });
    expect(out.results).toEqual([
      { kind: "potion", potionId: "potion_heal_s", quantity: 1 },
    ]);
    expect(out.potions.potion_heal_s).toBe(1);
    expect(out.materials.mana_dust).toBe(4); // 5 - 1
  });
});

describe("computeCraftOutcome — 배치(quantity > 1)", () => {
  it("quantity=5 — 재료 5배 차감 + 결과 5개", () => {
    const input = {
      ...base(),
      known: ["potion_heal_s_dust"],
      materials: { mana_dust: 7 },
    };
    const out = computeCraftOutcome(input, "potion_heal_s_dust", { quantity: 5 });
    expect(out.results).toHaveLength(5);
    expect(out.results.every((r) => r.kind === "potion")).toBe(true);
    expect(out.potions.potion_heal_s).toBe(5);
    expect(out.materials.mana_dust).toBe(2); // 7 - 5
  });

  it("재료가 quantity 배에 모자라면 missing_material (부분 차감 없음)", () => {
    const input = {
      ...base(),
      known: ["potion_heal_s_dust"],
      materials: { mana_dust: 3 },
    };
    expect(() =>
      computeCraftOutcome(input, "potion_heal_s_dust", { quantity: 5 }),
    ).toThrow(/missing_material/);
    // 입력은 안 바뀜
    expect(input.materials.mana_dust).toBe(3);
  });

  it("포션 누적이 한도 초과면 potion_full — 5개 만들면 16이 되어 한도(15) 초과", () => {
    const input = {
      ...base(),
      known: ["potion_heal_s_dust"],
      materials: { mana_dust: 99 },
      potions: { potion_heal_s: 11 }, // 11 + 5 = 16 > 15(기본)
    };
    expect(() =>
      computeCraftOutcome(input, "potion_heal_s_dust", { quantity: 5 }),
    ).toThrow(/potion_full/);
  });

  it("장비 배치 — 등급 추첨이 회마다 독립", () => {
    // rng 가 호출될 때마다 0.0, 0.999, 0.0 ... 으로 번갈아 → -2, 2, -2
    const seq = [0.0, 0.999, 0.0];
    let idx = 0;
    const rng = () => seq[idx++ % seq.length];
    const input = {
      ...base(),
      known: ["baseball_bat"],
      materials: { branch: 6 }, // 2 × 3
    };
    const out = computeCraftOutcome(input, "baseball_bat", { quantity: 3, rng });
    expect(out.results).toHaveLength(3);
    const tiers = out.results.map((r) =>
      r.kind === "equipment" ? r.tier : null,
    );
    expect(tiers).toEqual([-2, 2, -2]);
    expect(out.craftedEquipment.baseball_bat).toEqual({ "-2": 2, "2": 1 });
    expect(out.materials.branch).toBeUndefined();
  });

  it("quantity 가 정수 아니거나 범위 밖이면 invalid_quantity", () => {
    const input = {
      ...base(),
      known: ["potion_heal_s_dust"],
      materials: { mana_dust: 9 },
    };
    expect(() =>
      computeCraftOutcome(input, "potion_heal_s_dust", { quantity: 0 }),
    ).toThrow(/invalid_quantity/);
    expect(() =>
      computeCraftOutcome(input, "potion_heal_s_dust", { quantity: -1 }),
    ).toThrow(/invalid_quantity/);
    expect(() =>
      computeCraftOutcome(input, "potion_heal_s_dust", { quantity: 1.5 }),
    ).toThrow(/invalid_quantity/);
    expect(() =>
      computeCraftOutcome(input, "potion_heal_s_dust", { quantity: 9999 }),
    ).toThrow(/invalid_quantity/);
  });
});

describe("computeCraftOutcome — 고급 재료 사용(equipPicks)", () => {
  it("picks 명시 — 합계 ≠ need 면 invalid_picks", () => {
    const input = {
      ...base(),
      known: ["nailed_baseball_bat"],
      materials: { rusty_nail: 28 },
      craftedEquipment: { baseball_bat: { "2": 1 } },
    };
    expect(() =>
      computeCraftOutcome(input, "nailed_baseball_bat", {
        rng: rngMid,
        equipPicks: { baseball_bat: { crafted: { "2": 2 } } }, // 2 ≠ 1
      }),
    ).toThrow(/invalid_picks/);
  });

  it("picks 음수 카운트는 invalid_picks (bucket count 위조 차단)", () => {
    const input = {
      ...base(),
      known: ["nailed_baseball_bat"],
      materials: { rusty_nail: 28 },
      equipment: { baseball_bat: 5 },
    };
    // base 2 + crafted["1"]=-1 → sum 1 (정상 need 와 같지만) — isValidPick 이 음수를 차단.
    expect(() =>
      computeCraftOutcome(input, "nailed_baseball_bat", {
        rng: rngMid,
        equipPicks: { baseball_bat: { base: 2, crafted: { "1": -1 } } },
      }),
    ).toThrow(/invalid_picks/);
  });

  it("picks 비정수 카운트는 invalid_picks", () => {
    const input = {
      ...base(),
      known: ["nailed_baseball_bat"],
      materials: { rusty_nail: 28 },
      equipment: { baseball_bat: 5 },
    };
    expect(() =>
      computeCraftOutcome(input, "nailed_baseball_bat", {
        rng: rngMid,
        equipPicks: { baseball_bat: { base: 1.5 } },
      }),
    ).toThrow(/invalid_picks/);
  });

  it("picks 명시 — 보유량 부족이면 missing_ingredient", () => {
    const input = {
      ...base(),
      known: ["nailed_baseball_bat"],
      materials: { rusty_nail: 28 },
      // 보유는 +2 한 개뿐
      craftedEquipment: { baseball_bat: { "2": 1 } },
    };
    expect(() =>
      computeCraftOutcome(input, "nailed_baseball_bat", {
        rng: rngMid,
        equipPicks: { baseball_bat: { crafted: { "1": 1 } } }, // 합은 맞지만 +1 은 0
      }),
    ).toThrow(/missing_ingredient/);
  });

  it("picks 명시 — 정확히 그 등급에서 차감, 자동 fallback 비활성", () => {
    const input = {
      ...base(),
      known: ["nailed_baseball_bat"],
      materials: { rusty_nail: 28 },
      equipment: { baseball_bat: 5 }, // 무등급 5개도 있지만…
      craftedEquipment: { baseball_bat: { "2": 1 } },
    };
    const out = computeCraftOutcome(input, "nailed_baseball_bat", {
      rng: rngMid,
      equipPicks: { baseball_bat: { crafted: { "2": 1 } } },
    });
    // 무등급 5개는 그대로 남고, +2 1개만 빠진다.
    expect(out.equipment.baseball_bat).toBe(5);
    expect(out.craftedEquipment.baseball_bat).toBeUndefined();
  });

  it("picks 의 비-기본 인스턴스 → 결과 등급 bias 적용 (+2 → bias=3)", () => {
    // rng=0.5 면 평소 일반(0), bias=3 이면 +1(rng*156=78, -6-22-44=6, -66<0 → +1)
    const input = {
      ...base(),
      known: ["nailed_baseball_bat"],
      materials: { rusty_nail: 28 },
      craftedEquipment: { baseball_bat: { "2": 1 } },
    };
    const out = computeCraftOutcome(input, "nailed_baseball_bat", {
      rng: () => 0.5,
      equipPicks: { baseball_bat: { crafted: { "2": 1 } } },
    });
    expect(out.results[0].kind).toBe("equipment");
    if (out.results[0].kind === "equipment") {
      // bias=3, rng=0.5 → +1
      expect(out.results[0].tier).toBe(1);
    }
  });

  it("배치 — 회별로 강한 인스턴스부터 1개씩 배정", () => {
    // 2회 제작, +2 인스턴스 1개 + +1 인스턴스 1개 → 회 0 = bias 3, 회 1 = bias 2.
    // 동일 rng=0.5 → 회 0 +1(rng*156=78, -6-22-44=6, -66<0 → +1)
    //                회 1 (bias=2, 가중치 6/22/44/44/12=128, rng*128=64, -6-22-44=-8<0 → 0)
    const input = {
      ...base(),
      known: ["nailed_baseball_bat"],
      materials: { rusty_nail: 56 }, // 2회 × 28
      craftedEquipment: { baseball_bat: { "1": 1, "2": 1 } },
    };
    const out = computeCraftOutcome(input, "nailed_baseball_bat", {
      quantity: 2,
      rng: () => 0.5,
      equipPicks: {
        baseball_bat: { crafted: { "1": 1, "2": 1 } },
      },
    });
    const tiers = out.results.map((r) =>
      r.kind === "equipment" ? r.tier : null,
    );
    expect(tiers).toEqual([1, 0]);
  });

  it("base(기본 등급) pick 은 bias 없음 — 자동 fallback 과 차감만 다르게 동작", () => {
    const input = {
      ...base(),
      known: ["nailed_baseball_bat"],
      materials: { rusty_nail: 28 },
      equipment: { baseball_bat: 1 },
    };
    const out = computeCraftOutcome(input, "nailed_baseball_bat", {
      rng: () => 0.5,
      equipPicks: { baseball_bat: { base: 1 } },
    });
    expect(out.equipment.baseball_bat).toBeUndefined();
    if (out.results[0].kind === "equipment") {
      // bias=1, rng=0.5 → 0(일반)
      expect(out.results[0].tier).toBe(0);
    }
  });

  it("picks 미명시 ingredient 는 기존 자동 fallback 그대로 (낮은 등급부터)", () => {
    const input = {
      ...base(),
      known: ["nailed_baseball_bat"],
      materials: { rusty_nail: 28 },
      craftedEquipment: { baseball_bat: { "-1": 1, "2": 1 } },
    };
    const out = computeCraftOutcome(input, "nailed_baseball_bat", {
      rng: rngMid,
      // equipPicks 미지정 → 기존 동작.
    });
    // 낮은 등급 -1 이 먼저 빠지고 +2 만 남음.
    expect(out.craftedEquipment.baseball_bat).toEqual({ "2": 1 });
  });
});

describe("computeCraftOutcome — firstCraft 보호", () => {
  it("firstCraft 일 때 불량(-2) 롤이 0(일반) 으로 클램프", () => {
    const input = { ...base(), known: ["baseball_bat"], materials: { branch: 2 } };
    const out = computeCraftOutcome(input, "baseball_bat", {
      rng: rngMin,
      firstCraft: true,
    });
    expect(out.results).toEqual([
      { kind: "equipment", itemId: "baseball_bat", tier: 0 },
    ]);
    // 일반은 craftedEquipment 가 아닌 equipment[] 로.
    expect(out.equipment.baseball_bat).toBe(1);
    expect(out.craftedEquipment.baseball_bat).toBeUndefined();
  });

  it("firstCraft 라도 양수 등급(걸작)은 그대로 살림", () => {
    const input = { ...base(), known: ["baseball_bat"], materials: { branch: 2 } };
    const out = computeCraftOutcome(input, "baseball_bat", {
      rng: rngMax,
      firstCraft: true,
    });
    expect(out.results).toEqual([
      { kind: "equipment", itemId: "baseball_bat", tier: 2 },
    ]);
    expect(out.craftedEquipment.baseball_bat).toEqual({ "2": 1 });
  });

  it("firstCraft 배치 — 첫 회만 보호, 2 회차부터는 평소 분포", () => {
    // rng=0.0 → 평소 -2. 첫 회는 0 으로 클램프, 2 회차는 그대로 -2.
    const input = {
      ...base(),
      known: ["baseball_bat"],
      materials: { branch: 4 },
    };
    const out = computeCraftOutcome(input, "baseball_bat", {
      quantity: 2,
      rng: rngMin,
      firstCraft: true,
    });
    const tiers = out.results.map((r) =>
      r.kind === "equipment" ? r.tier : null,
    );
    expect(tiers).toEqual([0, -2]);
  });

  it("firstCraft=false (재제작) 면 평소 분포 — 불량 그대로", () => {
    const input = { ...base(), known: ["baseball_bat"], materials: { branch: 2 } };
    const out = computeCraftOutcome(input, "baseball_bat", {
      rng: rngMin,
      firstCraft: false,
    });
    if (out.results[0].kind === "equipment") {
      expect(out.results[0].tier).toBe(-2);
    }
  });
});

describe("computeCraftOutcome — 별빛 무구 (인스턴스 풀)", () => {
  const starlitInput = (): CraftComputeInput => ({
    ...base(),
    known: ["starlit_greatsword_str"],
    materials: {
      starfall_shard: 80,
    },
  });

  it("starlit_greatsword_str 제작 — equipment[] 가 아니라 equipmentInstances 풀로", () => {
    const out = computeCraftOutcome(starlitInput(), "starlit_greatsword_str", {
      rng: rngMid,
    });
    expect(out.equipment.starlit_greatsword_str).toBeUndefined();
    expect(out.craftedEquipment.starlit_greatsword_str).toBeUndefined();
    expect(out.equipmentInstances).toHaveLength(1);
    expect(out.equipmentInstances[0].itemId).toBe("starlit_greatsword_str");
    expect(out.equipmentInstances[0].enhancementLevel).toBe(0);
    expect(out.equipmentInstances[0].craftTier).toBeUndefined(); // 일반 등급
    expect(typeof out.equipmentInstances[0].instanceId).toBe("string");
    expect(out.equipmentInstances[0].instanceId.length).toBeGreaterThan(0);
  });

  it("재료 차감 — 별빛 조각 80 만 (다른 소재 없음)", () => {
    const out = computeCraftOutcome(starlitInput(), "starlit_greatsword_str", {
      rng: rngMid,
    });
    expect(out.materials.starfall_shard).toBeUndefined(); // 0 → cleanup
  });

  it("걸작(+2) 롤 → 인스턴스 craftTier=2 로 박힘", () => {
    const out = computeCraftOutcome(starlitInput(), "starlit_greatsword_str", {
      rng: rngMax,
    });
    expect(out.equipmentInstances[0].craftTier).toBe(2);
  });

  it("기존 인스턴스가 있을 때 새 인스턴스 append, 기존은 보존", () => {
    const existing = {
      instanceId: "old-id",
      itemId: "starlit_shield_vit" as const,
      enhancementLevel: 3,
    };
    const input = { ...starlitInput(), equipmentInstances: [existing] };
    const out = computeCraftOutcome(input, "starlit_greatsword_str", { rng: rngMid });
    expect(out.equipmentInstances).toHaveLength(2);
    expect(out.equipmentInstances[0]).toEqual(existing); // 변경 없음
    expect(out.equipmentInstances[1].itemId).toBe("starlit_greatsword_str");
  });

  it("배치 제작 — quantity 2 → 인스턴스 2자루 (서로 다른 instanceId)", () => {
    const input = {
      ...base(),
      known: ["starlit_greatsword_str"],
      materials: {
        starfall_shard: 160,
      },
    };
    const out = computeCraftOutcome(input, "starlit_greatsword_str", {
      quantity: 2,
      rng: rngMid,
    });
    expect(out.equipmentInstances).toHaveLength(2);
    expect(out.equipmentInstances[0].instanceId).not.toBe(
      out.equipmentInstances[1].instanceId,
    );
  });
});
