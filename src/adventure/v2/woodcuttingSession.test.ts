import { describe, expect, it } from "vitest";
import {
  WOODCUTTING_CLAIM_GRACE_MS,
  WOODCUTTING_TIMBER_REWARD,
  WOODCUTTING_TREES,
  createWoodcuttingSession,
  parseWoodcuttingLog,
  parseWoodcuttingSession,
  pickWoodcuttingTreeId,
  recordWoodcuttingSuccess,
} from "./woodcuttingSession";

describe("woodcuttingSession", () => {
  it("선택한 숲의 가중치 안에서만 나무를 고른다", () => {
    expect(pickWoodcuttingTreeId("pine_grove", () => 0)).toBe("pine");
    expect(pickWoodcuttingTreeId("pine_grove", () => 0.999)).toBe("nut_pine");
    expect(pickWoodcuttingTreeId("oak_grove", () => 0)).toBe("oak");
    expect(pickWoodcuttingTreeId("oak_grove", () => 0.999)).toBe("zelkova");
  });

  it("모든 나무의 벌목 보상은 통나무 1개다", () => {
    expect(WOODCUTTING_TIMBER_REWARD).toBe(1);
    expect(Object.values(WOODCUTTING_TREES)).toHaveLength(12);
  });

  it("숲·나무·완료 시각이 포함된 세션을 만든다", () => {
    const session = createWoodcuttingSession({
      sessionId: "s1",
      spotId: "oak_grove",
      treeId: "oak",
      now: 1_000,
    });
    expect(session.readyAt).toBe(1_000 + WOODCUTTING_TREES.oak.durationMs);
    expect(session.expiresAt).toBe(session.readyAt + WOODCUTTING_CLAIM_GRACE_MS);
    expect(parseWoodcuttingSession(session)).toEqual(session);
  });

  it("장소가 없는 예전 자동 벌목 세션은 읽지 않는다", () => {
    expect(
      parseWoodcuttingSession({
        sessionId: "old",
        treeId: "pine",
        readyAt: 1_000,
        expiresAt: 9_999,
      }),
    ).toBeNull();
  });

  it("성공 시 통나무와 새 수종별 완료 기록을 누적한다", () => {
    const log = recordWoodcuttingSuccess(parseWoodcuttingLog({}), {
      treeId: "maple",
      timber: WOODCUTTING_TIMBER_REWARD,
    });
    expect(log).toMatchObject({ cuts: 1, timberEarned: 1, trees: { maple: 1 } });
  });
});
