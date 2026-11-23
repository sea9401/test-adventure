import { describe, expect, it } from "vitest";
import * as battleView from "./V2MasteryTowerBattleView";

type ResultMessage = (
  result: {
    success?: boolean;
    practice?: boolean;
    floor?: number | null;
    power?: number;
    requiredPower?: number | null;
  },
  cooldownSeconds: number,
) => string;

type CanContinueAttempt = (
  result: {
    ok?: boolean;
    success?: boolean;
    practice?: boolean;
    error?: string;
  } | null,
  busy: boolean,
  cooldownSeconds: number,
) => boolean;

const resultMessage = (
  battleView as typeof battleView & {
    masteryTowerResultMessage?: ResultMessage;
  }
).masteryTowerResultMessage;
const canContinueAttempt = (
  battleView as typeof battleView & {
    canContinueMasteryTowerAttempt?: CanContinueAttempt;
  }
).canContinueMasteryTowerAttempt;

describe("숙련의 탑 전투 결과 문구", () => {
  it("100층 연습 승리를 일반 층 돌파와 구분한다", () => {
    expect(resultMessage).toBeTypeOf("function");
    expect(
      resultMessage?.(
        { success: true, practice: true, floor: 100 },
        0,
      ),
    ).toBe("100층 연습 승리");
  });

  it("100층 연습 패배는 쿨다운 뒤 연습 재도전 가능 여부를 안내한다", () => {
    expect(resultMessage).toBeTypeOf("function");
    expect(
      resultMessage?.(
        {
          success: false,
          practice: true,
          floor: 100,
          power: 100_000,
          requiredPower: 105_000,
        },
        30,
      ),
    ).toBe("100층 연습 실패 · 30초 후 연습 재도전 가능");
  });

  it("100층 연습 패배 결과에서 쿨다운이 끝나면 바로 재도전할 수 있다", () => {
    const result = {
      ok: true,
      success: false,
      practice: true,
      error: "cooldown",
    };

    expect(canContinueAttempt).toBeTypeOf("function");
    expect(canContinueAttempt?.(result, false, 30)).toBe(false);
    expect(canContinueAttempt?.(result, false, 0)).toBe(true);
  });
});

describe("숙련의 탑 전투 결과 버튼", () => {
  const plan = battleView.masteryTowerOutcomePlan;
  const clearedTower = { runFloor: 100, claimed: false };

  it("100층을 처음 깼고 오늘 보상을 안 받았으면 보상 받으러 가기가 먼저 나온다", () => {
    expect(
      plan({
        ok: true,
        success: true,
        practice: false,
        floor: 100,
        tower: clearedTower,
        claimPreview: { total: 120 },
      }),
    ).toEqual({
      primary: "tower",
      towerLabel: "보상 받으러 가기",
      secondary: "attempt",
      attemptLabel: "100층 연습 재도전",
    });
  });

  it("100층 연습에서 졌어도 보상을 안 받았으면 보상 받으러 가기가 먼저 나온다", () => {
    expect(
      plan({
        ok: true,
        success: false,
        practice: true,
        floor: 100,
        tower: { ...clearedTower, cooldownUntil: 1 },
        claimPreview: { total: 120 },
      }),
    ).toMatchObject({ primary: "tower", towerLabel: "보상 받으러 가기" });
  });

  it("오늘 보상을 이미 받았으면 연습 재도전이 먼저고 탑으로 돌아가는 버튼이 따로 있다", () => {
    expect(
      plan({
        ok: true,
        success: true,
        practice: true,
        floor: 100,
        tower: { runFloor: 100, claimed: true },
        claimPreview: { total: 0 },
      }),
    ).toEqual({
      primary: "attempt",
      attemptLabel: "100층 연습 재도전",
      secondary: "tower",
      towerLabel: "탑으로 돌아가기",
    });
  });

  it("100층 전 승리는 다음 층 입장 하나만 보여 준다", () => {
    expect(
      plan({
        ok: true,
        success: true,
        practice: false,
        floor: 42,
        tower: { runFloor: 42, claimed: false },
        claimPreview: { total: 80 },
      }),
    ).toEqual({
      primary: "attempt",
      attemptLabel: "다음 층 입장",
      secondary: null,
      towerLabel: null,
    });
  });

  it("100층 전 패배는 시작 위치 선택 하나만 보여 준다", () => {
    expect(
      plan({
        ok: true,
        success: false,
        practice: false,
        floor: 42,
        tower: { runFloor: 0, claimed: false, cooldownUntil: 1 },
        claimPreview: { total: 80 },
      }),
    ).toEqual({
      primary: "tower",
      towerLabel: "시작 위치 선택",
      secondary: null,
      attemptLabel: null,
    });
  });
});
