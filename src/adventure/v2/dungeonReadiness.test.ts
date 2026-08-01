import { describe, expect, it } from "vitest";
import { dungeonGrowthLabel, dungeonReadiness } from "./dungeonReadiness";

const base = {
  depth: 50,
  frontierDepth: 48,
  playerPower: 1_500,
  recommendedPower: 2_060,
  jobTier: 5,
  level: 80,
  levelCap: 100,
};

describe("dungeonReadiness", () => {
  it("전투력이 참고 난이도 이상이면 난이도 지표 상회", () => {
    expect(dungeonReadiness({ ...base, playerPower: 2_060 })).toMatchObject({
      status: "stable",
      label: "난이도 지표 상회",
    });
  });

  it("정복한 깊이는 전투력이 낮아도 실제 정복 기록을 우선한다", () => {
    expect(
      dungeonReadiness({ ...base, depth: 48, frontierDepth: 48 }),
    ).toMatchObject({ status: "proven", tone: "neutral" });
  });

  it("상위 직업 초반은 정복 여부보다 전직 후 성장 회복을 먼저 안내한다", () => {
    expect(
      dungeonReadiness({
        ...base,
        depth: 48,
        frontierDepth: 48,
        jobTier: 6,
        level: 20,
        playerPower: 3_000,
      }),
    ).toMatchObject({ status: "rebuilding", tone: "warning" });
  });

  it("다음 미정복 단계는 하드 차단 대신 도전 가능으로 안내한다", () => {
    expect(dungeonReadiness(base)).toMatchObject({
      status: "challenge",
      tone: "warning",
    });
  });
});

describe("dungeonGrowthLabel", () => {
  it("현재 직업 티어와 레벨 상한을 함께 표시한다", () => {
    expect(dungeonGrowthLabel({ jobTier: 6, level: 20, levelCap: 100 })).toBe(
      "6티어 · Lv.20/100",
    );
  });

  it("레벨이 없으면 표시를 생략한다", () => {
    expect(dungeonGrowthLabel({ jobTier: 2 })).toBeNull();
  });
});
