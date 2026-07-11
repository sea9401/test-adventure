import { describe, expect, it } from "vitest";
import {
  WOODCUTTING_CLAIM_GRACE_MS,
  WOODCUTTING_TREES,
  createWoodcuttingSession,
  parseWoodcuttingLog,
  parseWoodcuttingSession,
  pickWoodcuttingTreeId,
  recordWoodcuttingSuccess,
} from "./woodcuttingSession";

describe("woodcuttingSession", () => {
  it("가중치에 따라 나무를 고른다", () => {
    expect(pickWoodcuttingTreeId(() => 0)).toBe("pine");
    expect(WOODCUTTING_TREES[pickWoodcuttingTreeId(() => 0.999)].tier).toBe("ancient");
  });

  it("나무별 자동 벌목 시간과 도끼질 횟수를 둔다", () => {
    expect(WOODCUTTING_TREES.pine).toMatchObject({ durationMs: 3_000, chops: 5 });
    expect(WOODCUTTING_TREES.old_cedar).toMatchObject({ durationMs: 5_400, chops: 9 });
  });

  it("완료 시각과 수령 유예가 포함된 세션을 만든다", () => {
    const session = createWoodcuttingSession({ sessionId: "s1", treeId: "oak", now: 1_000 });
    expect(session.readyAt).toBe(1_000 + WOODCUTTING_TREES.oak.durationMs);
    expect(session.expiresAt).toBe(session.readyAt + WOODCUTTING_CLAIM_GRACE_MS);
    expect(parseWoodcuttingSession(session)).toEqual(session);
  });

  it("예전 방향 선택 세션은 자동 벌목 세션으로 읽지 않는다", () => {
    expect(
      parseWoodcuttingSession({
        sessionId: "old",
        treeId: "pine",
        challenge: { wind: 0, safeLane: 0, idealBackCut: "level" },
        expiresAt: 9_999,
      }),
    ).toBeNull();
  });

  it("성공 시 통나무와 나무별 완료 기록을 누적한다", () => {
    const log = recordWoodcuttingSuccess(parseWoodcuttingLog({ perfectCuts: 3 }), {
      treeId: "oak",
      timber: 3,
    });
    expect(log).toMatchObject({
      cuts: 1,
      perfectCuts: 3,
      timberEarned: 3,
      trees: { oak: 1 },
    });
  });
});
