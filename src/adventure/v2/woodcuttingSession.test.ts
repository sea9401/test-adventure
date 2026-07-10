import { describe, expect, it } from "vitest";
import {
  CHOP_REACTION_WINDOW_MS,
  WOODCUTTING_TREES,
  applyWoodcuttingHit,
  createWoodcuttingRound,
  judgeChop,
  parseWoodcuttingLog,
  pickWoodcuttingTreeId,
  recordWoodcuttingSuccess,
  rollChopReadyDelayMs,
  woodcuttingExpiresAtFor,
  woodcuttingTimberReward,
  type WoodcuttingSession,
} from "./woodcuttingSession";

describe("woodcuttingSession", () => {
  it("타격 대기 시간과 라운드 만료 시각을 계산한다", () => {
    expect(rollChopReadyDelayMs(() => 0)).toBe(900);
    expect(rollChopReadyDelayMs(() => 1)).toBe(2200);
    expect(woodcuttingExpiresAtFor(1000)).toBe(
      1000 + CHOP_REACTION_WINDOW_MS + 7000,
    );
    expect(
      createWoodcuttingRound({ index: 2, now: 1000, rng: () => 0 }),
    ).toMatchObject({
      index: 2,
      weakSpot: "root",
      readyAt: 1900,
    });
  });

  it("가중치에 따라 나무를 고른다", () => {
    expect(pickWoodcuttingTreeId(() => 0)).toBe("pine");
    expect(WOODCUTTING_TREES[pickWoodcuttingTreeId(() => 0.999)].tier).toBe(
      "ancient",
    );
  });

  it("타격 판정 — 이른 입력/만료/윈도우 초과/약점 실패/성공", () => {
    const base = {
      spot: "center" as const,
      weakSpot: "center" as const,
      readyAt: 1000,
      expiresAt: 5000,
    };
    expect(judgeChop({ ...base, reactionMs: -1, serverNow: 900 })).toEqual({
      grade: "miss",
      score: 0,
      reason: "too_early",
    });
    expect(judgeChop({ ...base, reactionMs: 100, serverNow: 6000 })).toEqual({
      grade: "miss",
      score: 0,
      reason: "expired",
    });
    expect(judgeChop({ ...base, reactionMs: 999, serverNow: 1100 })).toEqual({
      grade: "miss",
      score: 0,
      reason: "missed_window",
    });
    expect(
      judgeChop({
        ...base,
        spot: "left",
        reactionMs: 200,
        serverNow: 1200,
      }),
    ).toEqual({ grade: "miss", score: 0, reason: "wrong_spot" });
    expect(judgeChop({ ...base, reactionMs: 200, serverNow: 1200 })).toEqual({
      grade: "perfect",
      score: 3,
      reason: "ok",
    });
  });

  it("세 번의 타격 점수로 벌목 보상과 기록을 계산한다", () => {
    const session: WoodcuttingSession = {
      sessionId: "s1",
      treeId: "oak",
      round: { index: 1, weakSpot: "center", readyAt: 1000, expiresAt: 5000 },
      hits: [],
      combo: 0,
      bestCombo: 0,
    };
    const one = applyWoodcuttingHit(session, {
      spot: "center",
      reactionMs: 200,
      serverNow: 1200,
    }).session;
    const two = applyWoodcuttingHit(
      { ...one, round: { index: 2, weakSpot: "left", readyAt: 2000, expiresAt: 6000 } },
      { spot: "left", reactionMs: 420, serverNow: 2420 },
    ).session;
    const three = applyWoodcuttingHit(
      { ...two, round: { index: 3, weakSpot: "root", readyAt: 3000, expiresAt: 7000 } },
      { spot: "right", reactionMs: 200, serverNow: 3200 },
    ).session;

    expect(three.bestCombo).toBe(2);
    expect(woodcuttingTimberReward(WOODCUTTING_TREES.oak, three.hits, three.bestCombo)).toEqual({
      timber: 3,
      grade: "clean",
      score: 5,
    });

    const log = recordWoodcuttingSuccess(parseWoodcuttingLog({}), {
      treeId: "oak",
      timber: 3,
      bestReactionMs: 200,
      grade: "clean",
      bestCombo: three.bestCombo,
    });
    expect(log).toEqual({
      cuts: 1,
      perfectCuts: 0,
      timberEarned: 3,
      bestReactionMs: 200,
      bestCombo: 2,
      trees: { oak: 1 },
    });
  });
});
