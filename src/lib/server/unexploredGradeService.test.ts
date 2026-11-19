import { describe, expect, it } from "vitest";
import { EXPLORATION_GRADE_XP } from "@/adventure/data/v2/unexploredGrade";
import {
  applyUnexploredMutation,
  unexploredSnapshot,
  type UnexploredCharacterSave,
} from "./unexploredService";

// 탐사 등급이 탐사망 스냅샷과 프리셋 전환에 반영되는지 본다.

function character(grade: number, extra: Record<string, unknown> = {}): UnexploredCharacterSave {
  return {
    level: 100,
    gold: 0,
    bankedGold: 0,
    unexplored: {
      explorationProgressVersion: 2,
      xpPoints: 30,
      explorationXp: grade * EXPLORATION_GRADE_XP + 1_234,
      selectedNodeIds: ["start"],
      ...extra,
    },
  };
}

describe("탐사 등급 스냅샷", () => {
  it("30포인트 전에는 등급 정보가 0이고 기본 프리셋 세 칸과 기본 흔적 상한을 돌려준다", () => {
    const snapshot = unexploredSnapshot({
      level: 100,
      unexplored: { explorationProgressVersion: 2, xpPoints: 12, explorationXp: 40 },
    });

    expect(snapshot).toMatchObject({
      explorationGrade: 0,
      gradeXp: 0,
      gradeXpCost: EXPLORATION_GRADE_XP,
      gradeBonusPoints: 0,
      nextGradePointGrade: 5,
      presetSlotCount: 3,
      presetUnlockGrades: [0, 0, 0, 10, 40],
      traceCap: 2_500,
      earnedPoints: 12,
    });
    expect(snapshot.nextPointCost).toBeGreaterThan(0);
  });

  it("등급에 따라 추가 포인트, 프리셋 칸, 흔적 상한을 돌려준다", () => {
    const snapshot = unexploredSnapshot(character(20));

    expect(snapshot).toMatchObject({
      explorationGrade: 20,
      gradeXp: 1_234,
      gradeBonusPoints: 2,
      nextGradePointGrade: 30,
      presetSlotCount: 4,
      traceCap: 3_500,
      earnedPoints: 32,
      nextPointCost: 0,
    });
    expect(unexploredSnapshot(character(60))).toMatchObject({
      presetSlotCount: 5,
      traceCap: 5_000,
    });
  });
});

describe("탐사 등급 프리셋 칸", () => {
  it("등급이 모자라면 넷째 칸으로 전환할 수 없다", () => {
    expect(
      applyUnexploredMutation(character(9), { action: "switch_preset", presetIndex: 3 }),
    ).toEqual({ ok: false, error: "preset_locked" });
    expect(
      applyUnexploredMutation(character(10), { action: "switch_preset", presetIndex: 4 }),
    ).toEqual({ ok: false, error: "preset_locked" });
  });

  it("10등급부터 넷째 칸, 40등급부터 다섯째 칸을 따로 배분한다", () => {
    const fourth = applyUnexploredMutation(character(10), {
      action: "switch_preset",
      presetIndex: 3,
    });
    if (!fourth.ok) throw new Error(fourth.error);
    expect(fourth.snapshot).toMatchObject({ activePresetIndex: 3, selectedNodeIds: [] });

    const started = applyUnexploredMutation(fourth.character, {
      action: "activate",
      nodeId: "start",
      expectedPresetIndex: 3,
    });
    if (!started.ok) throw new Error(started.error);
    expect(started.snapshot.nodePresets).toEqual([["start"], [], [], ["start"], []]);

    const fifth = applyUnexploredMutation(character(40), {
      action: "switch_preset",
      presetIndex: 4,
    });
    expect(fifth.ok).toBe(true);
  });

  it("등급으로 받은 추가 포인트만큼 노드를 더 찍을 수 있다", () => {
    const base = character(0);
    const graded = character(5);

    expect(unexploredSnapshot(graded).earnedPoints).toBe(
      unexploredSnapshot(base).earnedPoints + 1,
    );
  });
});
