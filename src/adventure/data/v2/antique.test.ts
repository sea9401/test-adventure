import { describe, it, expect } from "vitest";
import {
  ANTIQUES,
  ANTIQUE_IDS,
  ANTIQUE_TIERS,
  ANTIQUE_TIER_ORDER,
  ANTIQUE_TOTAL,
  MIN_CONDITION,
  appraiseValue,
  conditionGradeLabel,
  formatCondition,
  isAntiqueId,
  pickAntiqueId,
  rollCondition,
  type AntiqueTier,
} from "./antique";

describe("골동품 카탈로그", () => {
  it("총 24종, 티어별 6/6/5/4/3", () => {
    expect(ANTIQUE_TOTAL).toBe(24);
    const counts: Record<AntiqueTier, number> = {
      common: 0,
      uncommon: 0,
      rare: 0,
      epic: 0,
      legendary: 0,
    };
    for (const id of ANTIQUE_IDS) counts[ANTIQUES[id].tier] += 1;
    expect(counts).toEqual({
      common: 6,
      uncommon: 6,
      rare: 5,
      epic: 4,
      legendary: 3,
    });
  });

  it("id 키와 entry.id 가 일치, baseValue 양수", () => {
    for (const id of ANTIQUE_IDS) {
      expect(ANTIQUES[id].id).toBe(id);
      expect(ANTIQUES[id].baseValue).toBeGreaterThan(0);
    }
  });

  it("티어 간 baseValue 밴드가 단조 증가(겹침 없음)", () => {
    // 각 티어 max < 다음 티어 min.
    let prevMax = 0;
    for (const tier of ANTIQUE_TIER_ORDER) {
      const vals = ANTIQUE_IDS.filter((id) => ANTIQUES[id].tier === tier).map(
        (id) => ANTIQUES[id].baseValue,
      );
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      expect(min).toBeGreaterThan(prevMax);
      prevMax = max;
    }
  });

  it("isAntiqueId 가드", () => {
    expect(isAntiqueId("clay_shard")).toBe(true);
    expect(isAntiqueId("dragon_jade_seal")).toBe(true);
    expect(isAntiqueId("not_a_thing")).toBe(false);
    expect(isAntiqueId("")).toBe(false);
  });
});

describe("보존상태 굴림 (rollCondition)", () => {
  it("rng 0 → 하한, rng 1 → 100", () => {
    expect(rollCondition("clay_shard", () => 0)).toBe(MIN_CONDITION);
    expect(rollCondition("clay_shard", () => 1)).toBe(100);
  });

  it("항상 [5,100] 정수", () => {
    for (const r of [0, 0.1, 0.37, 0.5, 0.8, 0.999]) {
      for (const id of ANTIQUE_IDS) {
        const c = rollCondition(id, () => r);
        expect(Number.isInteger(c)).toBe(true);
        expect(c).toBeGreaterThanOrEqual(MIN_CONDITION);
        expect(c).toBeLessThanOrEqual(100);
      }
    }
  });

  it("heavy-tail: 같은 rng 라도 높은 티어 k 가 더 낮은 보존상태", () => {
    // 전설(k=5) ≤ 흔함(k=2) at rng 0.5.
    const common = rollCondition("clay_shard", () => 0.5);
    const legendary = rollCondition("dragon_jade_seal", () => 0.5);
    expect(legendary).toBeLessThanOrEqual(common);
  });
});

describe("발굴 추첨 (pickAntiqueId)", () => {
  it("rng 0 → 첫 티어(흔함) 첫 종", () => {
    expect(pickAntiqueId(() => 0)).toBe("clay_shard");
  });

  it("rng 0.999 → 전설 마지막 종", () => {
    expect(pickAntiqueId(() => 0.999)).toBe("eternal_lantern");
  });

  it("항상 유효한 id 반환", () => {
    for (const r of [0, 0.2, 0.46, 0.73, 0.91, 0.999]) {
      expect(isAntiqueId(pickAntiqueId(() => r))).toBe(true);
    }
  });
});

describe("감정가 (appraiseValue)", () => {
  it("보존 100 = baseValue", () => {
    expect(appraiseValue("clay_shard", 100)).toBe(ANTIQUES.clay_shard.baseValue);
    expect(appraiseValue("dragon_jade_seal", 100)).toBe(
      ANTIQUES.dragon_jade_seal.baseValue,
    );
  });

  it("보존상태에 단조 증가", () => {
    const id = "celadon_vase";
    let prev = -1;
    for (const c of [5, 30, 60, 85, 100]) {
      const v = appraiseValue(id, c);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });

  it("하한 미만은 5 로 클램프", () => {
    expect(appraiseValue("clay_shard", 0)).toBe(appraiseValue("clay_shard", 5));
    expect(appraiseValue("clay_shard", -50)).toBe(appraiseValue("clay_shard", 5));
  });
});

describe("보존상태 표기", () => {
  it("등급 라벨 경계", () => {
    expect(conditionGradeLabel(100)).toBe("완벽");
    expect(conditionGradeLabel(85)).toBe("온전");
    expect(conditionGradeLabel(84)).toBe("양호");
    expect(conditionGradeLabel(60)).toBe("양호");
    expect(conditionGradeLabel(59)).toBe("보통");
    expect(conditionGradeLabel(30)).toBe("보통");
    expect(conditionGradeLabel(29)).toBe("삭음");
    expect(conditionGradeLabel(5)).toBe("삭음");
  });

  it("formatCondition", () => {
    expect(formatCondition(82)).toBe("82% (양호)");
    expect(formatCondition(100)).toBe("100% (완벽)");
  });
});

describe("티어 메타", () => {
  it("전 티어 메타 존재 + 가중치 양수", () => {
    for (const t of ANTIQUE_TIER_ORDER) {
      expect(ANTIQUE_TIERS[t].digRarityWeight).toBeGreaterThan(0);
      expect(ANTIQUE_TIERS[t].conditionExponent).toBeGreaterThanOrEqual(1);
      expect(ANTIQUE_TIERS[t].dismantleCoins).toBeGreaterThan(0);
    }
  });
});
