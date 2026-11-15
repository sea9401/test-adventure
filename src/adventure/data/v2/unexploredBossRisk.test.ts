import { describe, expect, it } from "vitest";
import {
  UNEXPLORED_BOSS_RISK_MAX,
  UNEXPLORED_BOSS_RISK_TITLE_IDS,
  maxSelectableBossRisk,
  parseBossRiskRecord,
  parseBossRiskTier,
  recordBossRiskClear,
  riskBossCoreCount,
  riskHpMultiplier,
  riskJackpotChancePct,
  riskMinimumQualityPct,
  riskStatMultiplier,
  totalBossRisk,
  unexploredBossRiskTitleIds,
} from "./unexploredBossRisk";

describe("개인 보스 위험도", () => {
  it("위험도마다 체력 +50%, 능력치 배율 +8%", () => {
    expect([0, 1, 10].map(riskHpMultiplier)).toEqual([1, 1.5, 6]);
    expect([0, 1, 10].map((tier) => Math.round(riskStatMultiplier(tier) * 100) / 100)).toEqual([1, 1.08, 1.8]);
  });

  it("보상은 위험도 10에서 멈춘다", () => {
    expect([0, 1, 10, 25].map(riskBossCoreCount)).toEqual([1, 2, 11, 11]);
    expect([0, 1, 10, 25].map(riskMinimumQualityPct)).toEqual([0, 5, 50, 50]);
    expect([0, 1, 10, 25].map((tier) => Math.round(riskJackpotChancePct(tier) * 10) / 10)).toEqual([0.5, 0.6, 1.5, 1.5]);
  });

  it("위험도 값은 0부터 상한까지의 정수만 받는다", () => {
    expect(parseBossRiskTier(undefined)).toBe(0);
    expect(parseBossRiskTier(7)).toBe(7);
    expect(parseBossRiskTier(UNEXPLORED_BOSS_RISK_MAX)).toBe(60);
    for (const bad of [-1, 1.5, "2", null, NaN, 61]) expect(parseBossRiskTier(bad)).toBeNull();
  });

  it("처치한 적이 있으면 위험도 1이 열리고, 처치한 위험도 다음까지 고를 수 있다", () => {
    expect(maxSelectableBossRisk({ defeated: false, best: 0 })).toBe(0);
    expect(maxSelectableBossRisk({ defeated: true, best: 0 })).toBe(1);
    expect(maxSelectableBossRisk({ defeated: true, best: 4 })).toBe(5);
    expect(maxSelectableBossRisk({ defeated: true, best: 60 })).toBe(60);
  });

  it("보스별 최고 처치 위험도를 읽고 더 높을 때만 올린다", () => {
    const record = parseBossRiskRecord({ tracking_weapon: 3, unknown_boss: 9, glacial_colossus: -2, toxic_blood_lord: 99 });
    expect(record).toEqual({ tracking_weapon: 3, toxic_blood_lord: 60 });
    expect(recordBossRiskClear(record, "tracking_weapon", 2)).toBe(record);
    expect(recordBossRiskClear(record, "tracking_weapon", 4)).toEqual({ tracking_weapon: 4, toxic_blood_lord: 60 });
    expect(recordBossRiskClear(record, "glacial_colossus", 0)).toBe(record);
    expect(totalBossRisk(record)).toBe(63);
    expect(parseBossRiskRecord(null)).toEqual({});
  });

  it("칭호는 최고 위험도 합계 30, 60에 받는다", () => {
    expect(unexploredBossRiskTitleIds(29)).toEqual([]);
    expect(unexploredBossRiskTitleIds(30)).toEqual([UNEXPLORED_BOSS_RISK_TITLE_IDS[30]]);
    expect(unexploredBossRiskTitleIds(61)).toHaveLength(2);
  });
});

describe("개인 보스 위험도 칭호", () => {
  it("합계 30·60 칭호가 칭호 목록에 있다", async () => {
    const { TITLES } = await import("@/adventure/data/titles");
    expect(TITLES[UNEXPLORED_BOSS_RISK_TITLE_IDS[30]]).toMatchObject({
      name: "위험을 좇는 자",
      condition: "미개척지 개인 보스 위험도 합계 30 달성",
    });
    expect(TITLES[UNEXPLORED_BOSS_RISK_TITLE_IDS[60]]).toMatchObject({
      name: "위험의 끝에 선 자",
      condition: "미개척지 개인 보스 위험도 합계 60 달성",
    });
  });
});
