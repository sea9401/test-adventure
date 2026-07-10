import { describe, expect, it } from "vitest";
import {
  CHOP_REACTION_WINDOW_MS,
  WOODCUTTING_TREES,
  chopQualityBonus,
  judgeChop,
  parseWoodcuttingLog,
  pickWoodcuttingTreeId,
  recordWoodcuttingSuccess,
  rollChopReadyDelayMs,
  woodcuttingExpiresAtFor,
} from "./woodcuttingSession";

describe("woodcuttingSession", () => {
  it("타격 대기 시간과 만료 시각을 계산한다", () => {
    expect(rollChopReadyDelayMs(() => 0)).toBe(1800);
    expect(rollChopReadyDelayMs(() => 1)).toBe(5200);
    expect(woodcuttingExpiresAtFor(1000)).toBe(
      1000 + CHOP_REACTION_WINDOW_MS + 12000,
    );
  });

  it("가중치에 따라 나무를 고른다", () => {
    expect(pickWoodcuttingTreeId(() => 0)).toBe("pine");
    expect(WOODCUTTING_TREES[pickWoodcuttingTreeId(() => 0.999)].tier).toBe(
      "ancient",
    );
  });

  it("타격 판정 — 이른 입력/만료/윈도우 초과/성공", () => {
    expect(
      judgeChop({ reactionMs: -1, serverNow: 900, readyAt: 1000, expiresAt: 5000 }),
    ).toEqual({ success: false, reason: "too_early" });
    expect(
      judgeChop({ reactionMs: 100, serverNow: 6000, readyAt: 1000, expiresAt: 5000 }),
    ).toEqual({ success: false, reason: "expired" });
    expect(
      judgeChop({ reactionMs: 999, serverNow: 1100, readyAt: 1000, expiresAt: 5000 }),
    ).toEqual({ success: false, reason: "missed_window" });
    expect(
      judgeChop({ reactionMs: 200, serverNow: 1200, readyAt: 1000, expiresAt: 5000 }),
    ).toEqual({ success: true, reason: "ok" });
  });

  it("반응 품질과 누적 기록을 계산한다", () => {
    expect(chopQualityBonus(200)).toEqual({ grade: "perfect", bonus: 2 });
    expect(chopQualityBonus(400)).toEqual({ grade: "good", bonus: 1 });
    expect(chopQualityBonus(700)).toEqual({ grade: "clean", bonus: 0 });

    const log = recordWoodcuttingSuccess(parseWoodcuttingLog({}), {
      treeId: "oak",
      timber: 4,
      reactionMs: 200,
      grade: "perfect",
    });
    expect(log).toEqual({
      cuts: 1,
      perfectCuts: 1,
      timberEarned: 4,
      bestReactionMs: 200,
      trees: { oak: 1 },
    });
  });
});
