import { describe, expect, it } from "vitest";
import {
  computeCoopReward,
  coopRewardSeed,
  resolveCoopReward,
} from "./rewards";

// 2026-05-19: 7 스토리 코옵 보스(운봉의 거인 / 별을 지키는 자 / 천공인의 왕 / 창공의 주재 /
// 3 별빛 잔영) 솔로 region.boss 로 전환 — 그 보스들의 legend unique·칭호는 monster.drops·
// onDefeatTitleId 로 마이그레이션. 협동 보상 표는 dragon_nest 월드 보스 한 종만 남음.
describe("computeCoopReward — 월드 보스 (태고의 노룡) 한 종만", () => {
  it("미등록 보스 → 빈 보상 (스토리 7종은 모두 솔로 전환)", () => {
    for (const name of [
      "운봉의 거인",
      "별을 지키는 자",
      "천공인의 왕",
      "창공의 주재",
      "별빛 거인 잔영",
      "수심의 메아리",
      "성문지기 잔영",
      "없는보스",
    ]) {
      const r = computeCoopReward(name, "legend");
      expect(r.materials).toEqual({});
      expect(r.recipes).toEqual([]);
      expect(r.titleId).toBeUndefined();
      expect(r.equipRolls).toBeUndefined();
    }
  });

  it("태고의 노룡 — legend 시 칭호 + 5% primordial_regalia 굴림", () => {
    const r = computeCoopReward("태고의 노룡", "legend");
    expect(r.titleId).toBe("primordial_slayer");
    expect(r.equipRolls).toEqual([
      { itemId: "primordial_blade", chance: 0.2 },
      { itemId: "primordial_aegis", chance: 0.2 },
      { itemId: "primordial_helm", chance: 0.2 },
      { itemId: "primordial_cloak", chance: 0.15 },
      { itemId: "primordial_regalia", chance: 0.05 },
    ]);
  });

  it("태고의 노룡 — gold 누적 시 4 종 무기 굴림 + 재료", () => {
    const r = computeCoopReward("태고의 노룡", "gold");
    expect(r.materials.dragonscale_shard).toBe(6); // bronze 3 + gold 3
    expect(r.materials.bone_rune_steel).toBe(3); // silver 1 + gold 2
    expect(r.titleId).toBeUndefined();
  });
});

describe("resolveCoopReward — 서버 RNG 결정성", () => {
  it("같은 seed 두 번 호출 → 동일 결과 (retry 안전)", () => {
    const r = computeCoopReward("운봉의 거인", "legend");
    const seed = coopRewardSeed("session-A", "user-1");
    const a = resolveCoopReward(r, seed);
    const b = resolveCoopReward(r, seed);
    expect(a).toEqual(b);
  });

  it("다른 (sessionId, userId) → 다른 seed", () => {
    const seedA = coopRewardSeed("session-A", "user-1");
    const seedB = coopRewardSeed("session-B", "user-1");
    expect(seedA).not.toBe(seedB);
  });

  it("recipeOneOf 가 있으면 정확히 한 개를 picked 으로 recipes 에 추가", () => {
    // 솔로 전환된 스토리 보스들은 TIER_TABLES 엔 더 이상 없음 — mock reward 로 검증.
    const reward = {
      materials: {},
      recipes: [],
      recipeOneOf: ["a", "b", "c", "d"],
    };
    const resolved = resolveCoopReward(reward, 1);
    expect(resolved.recipes.length).toBe(1);
    expect(reward.recipeOneOf).toContain(resolved.recipes[0]);
  });

  it("recipeRolls chance 1 은 항상 통과, 0 은 항상 탈락", () => {
    const reward = {
      materials: {},
      recipes: [],
      recipeRolls: [
        { recipeId: "always_pass", chance: 1 },
        { recipeId: "always_fail", chance: 0 },
      ],
    };
    const r = resolveCoopReward(reward, 42);
    expect(r.recipes).toContain("always_pass");
    expect(r.recipes).not.toContain("always_fail");
  });

  it("equipRolls chance 1 은 항상 통과, 0 은 항상 탈락", () => {
    const reward = {
      materials: {},
      recipes: [],
      equipRolls: [
        { itemId: "always_drop" as never, chance: 1 },
        { itemId: "never_drop" as never, chance: 0 },
      ],
    };
    const r = resolveCoopReward(reward, 42);
    expect(r.equipment).toContain("always_drop");
    expect(r.equipment).not.toContain("never_drop");
  });

  it("seed 100 개로 0.5 chance roll 통과 비율 30~70 (sanity)", () => {
    const reward = {
      materials: {},
      recipes: [],
      recipeRolls: [{ recipeId: "fifty", chance: 0.5 }],
    };
    let pass = 0;
    for (let i = 0; i < 100; i += 1) {
      const r = resolveCoopReward(reward, i);
      if (r.recipes.includes("fifty")) pass += 1;
    }
    expect(pass).toBeGreaterThan(30);
    expect(pass).toBeLessThan(70);
  });
});

describe("별을 잊은 것 — 별빛 고리 드랍 (gold 부터, 티어 오를수록 상승)", () => {
  it("ringRoll 이 도달 티어 값으로 덮어써져 resolve 까지 전달된다", () => {
    expect(computeCoopReward("별을 잊은 것", "bronze").ringRoll).toBeUndefined();
    expect(computeCoopReward("별을 잊은 것", "silver").ringRoll?.chance).toBe(0.15);
    expect(computeCoopReward("별을 잊은 것", "gold").ringRoll?.chance).toBe(0.25);
    expect(computeCoopReward("별을 잊은 것", "epic").ringRoll?.chance).toBe(0.35);
    expect(computeCoopReward("별을 잊은 것", "legend").ringRoll?.chance).toBe(0.45);
  });

  it("legend 누적 보상엔 별빛 조각 + 칭호 + ringRoll 이 모두 산다", () => {
    const r = computeCoopReward("별을 잊은 것", "legend");
    expect(r.materials.starfall_shard).toBe(8 + 16 + 28 + 44 + 60);
    expect(r.titleId).toBe("forgotten_star_slayer");
    expect(r.ringRoll?.chance).toBe(0.45);
  });

  it("resolveCoopReward — ringRoll 통과 시 롤된 별빛 고리 인스턴스 생성", () => {
    // 확률 1 로 강제해 결정성 확보 (chance=1 이면 어떤 seed 든 통과).
    const reward = { ...computeCoopReward("별을 잊은 것", "legend"), ringRoll: { chance: 1 } };
    const resolved = resolveCoopReward(reward, coopRewardSeed("s1", "u1"));
    expect(resolved.equipmentInstances).toHaveLength(1);
    const inst = resolved.equipmentInstances[0]!;
    expect(inst.itemId).toBe("starlit_ring");
    expect(Object.keys(inst.rolledBonus ?? {})).toHaveLength(2);
  });
});
