import { describe, expect, it } from "vitest";
import {
  WOODCUTTING_CLAIM_GRACE_MS,
  WOODCUTTING_MATERIALS,
  WOODCUTTING_TIMBER_REWARD,
  WOODCUTTING_TREES,
  createWoodcuttingSession,
  parseWoodcuttingLog,
  parseWoodcuttingLogWithLevelMigration,
  parseWoodcuttingSession,
  pickWoodcuttingTreeId,
  recordWoodcuttingSuccess,
  woodcuttingAttemptSucceeds,
} from "./woodcuttingSession";

describe("woodcuttingSession", () => {
  it("선택한 숲의 고정 수종을 고른다", () => {
    expect(pickWoodcuttingTreeId("pine_grove")).toBe("pine");
    expect(pickWoodcuttingTreeId("oak_grove")).toBe("oak");
    expect(pickWoodcuttingTreeId("cypress_grove")).toBe("cypress");
  });

  it("모든 나무는 서로 다른 원목 재료 1개를 보상한다", () => {
    expect(WOODCUTTING_TIMBER_REWARD).toBe(1);
    expect(Object.values(WOODCUTTING_TREES)).toHaveLength(6);
    expect(new Set(Object.values(WOODCUTTING_TREES).map((tree) => tree.materialId)).size).toBe(6);
    for (const tree of Object.values(WOODCUTTING_TREES)) {
      expect(WOODCUTTING_MATERIALS[tree.materialId]).toBeDefined();
    }
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
    expect(session.failureRate).toBe(WOODCUTTING_TREES.oak.baseFailureRate);
    expect(parseWoodcuttingSession(session)).toEqual(session);
  });

  it("실패율 경계에 따라 서버 판정을 고정한다", () => {
    expect(woodcuttingAttemptSucceeds(0.22, 0.219)).toBe(false);
    expect(woodcuttingAttemptSucceeds(0.22, 0.22)).toBe(true);
    expect(woodcuttingAttemptSucceeds(0, 0)).toBe(true);
    expect(woodcuttingAttemptSucceeds(1, 0.999)).toBe(false);
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

  it("성공 시 원목과 새 수종별 완료 기록을 누적한다", () => {
    const log = recordWoodcuttingSuccess(parseWoodcuttingLog({}), {
      treeId: "birch",
      timber: WOODCUTTING_TIMBER_REWARD,
      xp: WOODCUTTING_TREES.birch.xp,
    });
    expect(log).toMatchObject({
      cuts: 1,
      xp: WOODCUTTING_TREES.birch.xp,
      timberEarned: 1,
      trees: { birch: 1 },
    });
  });

  it("기존 기록은 완료 횟수당 10 XP로 이어받는다", () => {
    expect(parseWoodcuttingLog({ cuts: 7 }).xp).toBe(70);
    expect(parseWoodcuttingLog({ cuts: 7, xp: 93 }).xp).toBe(93);
  });

  it("횟수에서 복구한 구 XP도 60레벨 한도에서 한 번 환산한다", () => {
    const parsed = parseWoodcuttingLogWithLevelMigration({ cuts: 999_999 });
    expect(parsed.levelCurveMigrated).toBe(true);
    expect(parsed.log).toMatchObject({
      levelCurveVersion: 2,
      xp: 135_993,
    });
  });
});
