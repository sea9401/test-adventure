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
    ).toBe("100층 연습 실패 · 전투력 100,000/105,000 · 30초 후 연습 재도전 가능");
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
