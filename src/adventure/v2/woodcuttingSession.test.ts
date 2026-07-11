import { describe, expect, it } from "vitest";
import {
  WOODCUTTING_TREES,
  createWoodcuttingChallenge,
  judgeWoodcuttingPlan,
  parseWoodcuttingLog,
  pickWoodcuttingTreeId,
  recordWoodcuttingSuccess,
  woodcuttingTimberReward,
} from "./woodcuttingSession";

describe("woodcuttingSession", () => {
  it("가중치에 따라 나무를 고른다", () => {
    expect(pickWoodcuttingTreeId(() => 0)).toBe("pine");
    expect(WOODCUTTING_TREES[pickWoodcuttingTreeId(() => 0.999)].tier).toBe("ancient");
  });

  it("바람을 보정할 수 있는 안전 구역과 뒤베기 결을 만든다", () => {
    const values = [0, 0, 0];
    const challenge = createWoodcuttingChallenge(() => values.shift() ?? 0);
    expect(challenge).toEqual({ wind: -1, safeLane: -2, idealBackCut: "low" });
    expect(challenge.safeLane - challenge.wind).toBe(-1);
  });

  it("앞베기로 바람을 보정하고 결 높이를 맞추면 완벽 판정한다", () => {
    const judgment = judgeWoodcuttingPlan({
      challenge: { wind: 1, safeLane: 1, idealBackCut: "high" },
      selectedLane: 0,
      backCut: "high",
    });
    expect(judgment).toMatchObject({
      landingLane: 1,
      directionError: 0,
      backCutError: 0,
      score: 9,
      grade: "perfect",
      reason: "ok",
    });
    expect(woodcuttingTimberReward(WOODCUTTING_TREES.oak, judgment)).toEqual({
      timber: 6,
      grade: "perfect",
      score: 9,
    });
  });

  it("안전 구역에서 멀리 쓰러지면 보상을 주지 않는다", () => {
    const judgment = judgeWoodcuttingPlan({
      challenge: { wind: -1, safeLane: -1, idealBackCut: "level" },
      selectedLane: 2,
      backCut: "level",
    });
    expect(judgment).toMatchObject({ landingLane: 1, grade: null, reason: "unsafe_fall" });
    expect(woodcuttingTimberReward(WOODCUTTING_TREES.pine, judgment).timber).toBe(0);
  });

  it("성공 기록은 기존 로그 형식을 유지하며 누적한다", () => {
    const log = recordWoodcuttingSuccess(parseWoodcuttingLog({ bestReactionMs: 210 }), {
      treeId: "oak",
      timber: 6,
      grade: "perfect",
    });
    expect(log).toMatchObject({
      cuts: 1,
      perfectCuts: 1,
      timberEarned: 6,
      bestReactionMs: 210,
      trees: { oak: 1 },
    });
  });
});
