import { describe, it, expect } from "vitest";
import {
  aggregateBalanceTelemetry,
  median,
  type TelemetryUser,
} from "./aggregate";
import { MAX_FRONTIER_DEPTH } from "@/adventure/data/v2/dungeon";
import { V2_STAT_KEYS } from "@/adventure/data/v2/v2StatKeys";
import type { V2StatKey } from "@/adventure/data/v2/v2StatKeys";

// 지배 스탯 dom 을 최대로 한 6스탯 맵.
function stats(dom: V2StatKey, domVal = 100, base = 10) {
  const s = {} as Record<V2StatKey, number>;
  for (const k of V2_STAT_KEYS) s[k] = base;
  s[dom] = domVal;
  return s;
}

function user(p: Partial<TelemetryUser>): TelemetryUser {
  return {
    level: 1,
    frontierDepth: 1,
    gold: 0,
    power: 0,
    totalStats: stats("dex"),
    classId: "warrior",
    classTier: 1,
    jobId: "warrior",
    jobName: "견습 병사",
    jobTier: 1,
    totalMastery: 0,
    currentMastery: 0,
    reincarnations: 0,
    spBudget: 12,
    spUsed: 0,
    skillsLearned: 0,
    skillsEquipped: 0,
    equipmentOwned: 0,
    equipmentEquipped: 0,
    maxEnhanceLevel: 0,
    fishCaught: 0,
    fishSpecies: 0,
    antiquesFound: 0,
    equippedIds: [],
    ...p,
  };
}

describe("median", () => {
  it("빈 배열 0, 홀수=중앙, 짝수=두 중앙 평균(반올림)", () => {
    expect(median([])).toBe(0);
    expect(median([5])).toBe(5);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(3); // (2+3)/2=2.5 → 3
  });
});

describe("aggregateBalanceTelemetry", () => {
  it("빈 입력 — players 0, 평균/중앙 0, 메타 반영", () => {
    const t = aggregateBalanceTelemetry([], {
      adminExcluded: 4,
      deriveFailed: 1,
    });
    expect(t.summary.players).toBe(0);
    expect(t.summary.adminExcluded).toBe(4);
    expect(t.summary.deriveFailed).toBe(1);
    expect(t.summary.avgPower).toBe(0);
    expect(t.summary.maxFrontierDepth).toBe(MAX_FRONTIER_DEPTH);
    expect(t.depthBands.every((b) => b.players === 0)).toBe(true);
    expect(t.equipmentUsage).toEqual([]);
  });

  it("깊이 밴드 — 테마 범위 매칭 + 캡 너머는 레거시 버킷", () => {
    const users = [
      user({ frontierDepth: 5 }), // 들판(1~6)
      user({ frontierDepth: 9 }), // 마른 협곡(7~12)
      user({ frontierDepth: MAX_FRONTIER_DEPTH + 8 }), // 레거시(>MAX)
    ];
    const t = aggregateBalanceTelemetry(users, {
      adminExcluded: 0,
      deriveFailed: 0,
    });
    const field = t.depthBands.find((b) => b.label.startsWith("들판"));
    const canyon = t.depthBands.find((b) => b.label.startsWith("마른 협곡"));
    const legacy = t.depthBands.find((b) => b.label.includes("레거시"));
    expect(field?.players).toBe(1);
    expect(canyon?.players).toBe(1);
    expect(legacy?.players).toBe(1);
    expect(legacy?.label).toContain(`${MAX_FRONTIER_DEPTH}+`);
  });

  it("레벨 밴드 + 평균 전투력 + 경제(골드)", () => {
    const users = [
      user({ level: 10, power: 100, gold: 500 }), // 1-29
      user({ level: 40, power: 300, gold: 1500 }), // 30-49
      user({ level: 100, power: 1700, gold: 100000, bankedGold: 25000 }), // 100+
    ];
    const t = aggregateBalanceTelemetry(users, {
      adminExcluded: 0,
      deriveFailed: 0,
    });
    const b1 = t.levelBands.find((b) => b.label === "1-29");
    const b100 = t.levelBands.find((b) => b.label === "100+");
    expect(b1?.players).toBe(1);
    expect(b1?.avgPower).toBe(100);
    expect(b100?.avgPower).toBe(1700);
    // 경제 — 100+ 골드.
    const e100 = t.economy.find((e) => e.label === "100+");
    expect(e100?.avgGold).toBe(125000);
    expect(e100?.maxGold).toBe(125000);
    expect(t.goldSummary.avgWalletGold).toBe(34000);
    expect(t.goldSummary.avgBankGold).toBe(8333);
    expect(t.goldSummary.avgTotalGold).toBe(42333);
    expect(t.goldSummary.maxTotalGold).toBe(125000);
    // 전체 전투력 — median([100,300,1700])=300, avg=round(2100/3)=700.
    expect(t.summary.medianPower).toBe(300);
    expect(t.summary.avgPower).toBe(700);
  });

  it("지배 스탯 + 유효 스탯 평균(DEX 독주 검출 형태)", () => {
    const users = [
      user({ totalStats: stats("dex", 200) }),
      user({ totalStats: stats("dex", 180) }),
      user({ totalStats: stats("vit", 150) }),
    ];
    const t = aggregateBalanceTelemetry(users, {
      adminExcluded: 0,
      deriveFailed: 0,
    });
    const dex = t.statAxes.find((s) => s.key === "dex");
    const vit = t.statAxes.find((s) => s.key === "vit");
    expect(dex?.dominantCount).toBe(2);
    expect(vit?.dominantCount).toBe(1);
    // dex 평균 = (200+180+10)/3 = 130.
    expect(dex?.avg).toBe(130);
    // statAxes 는 평균 내림차순.
    expect(t.statAxes[0].avg).toBeGreaterThanOrEqual(t.statAxes[1].avg);
  });

  it("직업·차수 분포 + 장비 사용률(빈도 내림차순)", () => {
    const users = [
      user({ classId: "warrior", classTier: 1, equippedIds: ["v2_iron_sword"] }),
      user({
        classId: "warrior",
        classTier: 2,
        equippedIds: ["v2_iron_sword", "v2_leather_armor"],
      }),
      user({ classId: "mage", classTier: 4, equippedIds: ["v2_iron_sword"] }),
    ];
    const t = aggregateBalanceTelemetry(users, {
      adminExcluded: 0,
      deriveFailed: 0,
    });
    expect(t.classDist.find((c) => c.key === "warrior")?.count).toBe(2);
    expect(t.classDist.find((c) => c.key === "mage")?.count).toBe(1);
    expect(t.jobDist.find((j) => j.key === "warrior")?.count).toBe(3);
    expect(t.jobTierDist).toEqual([{ tier: 1, count: 3 }]);
    expect(t.classDist[0].count).toBeGreaterThanOrEqual(t.classDist[1].count);
    expect(t.tierDist).toEqual([
      { tier: 1, count: 1 },
      { tier: 2, count: 1 },
      { tier: 4, count: 1 },
    ]);
    // 장비 사용률 — iron_sword 3, leather_armor 1, 내림차순.
    expect(t.equipmentUsage[0]).toMatchObject({ id: "v2_iron_sword", count: 3 });
    expect(t.equipmentUsage.find((e) => e.id === "v2_leather_armor")?.count).toBe(
      1,
    );
  });
});
