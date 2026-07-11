import { describe, expect, it } from "vitest";
import {
  MINING_CLAIM_GRACE_MS,
  createMiningSession,
  miningAttemptSucceeds,
  parseMiningLog,
  parseMiningSession,
  recordMiningSuccess,
} from "./miningSession";

describe("채광 세션", () => {
  it("완료 시각과 수령 유예 시간을 서버 기준으로 만든다", () => {
    const session = createMiningSession({
      sessionId: "mine-1",
      spotId: "gold_mine",
      nodeId: "gold",
      now: 1_000,
      durationMs: 12_000,
      failureRate: 0.5,
    });
    expect(session.readyAt).toBe(13_000);
    expect(session.expiresAt).toBe(13_000 + MINING_CLAIM_GRACE_MS);
    expect(parseMiningSession(session)).toEqual(session);
  });

  it("실패율 경계 이상일 때 성공한다", () => {
    expect(miningAttemptSucceeds(0.5, 0.499)).toBe(false);
    expect(miningAttemptSucceeds(0.5, 0.5)).toBe(true);
  });

  it("성공 기록에 광석·부산물·XP를 누적한다", () => {
    const next = recordMiningSuccess(parseMiningLog({}), {
      nodeId: "silver",
      ore: 1,
      byproducts: 2,
      xp: 8,
    });
    expect(next).toMatchObject({
      successes: 1,
      xp: 8,
      oreEarned: 1,
      byproductsEarned: 2,
      nodes: { silver: 1 },
    });
  });
});
