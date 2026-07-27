import { describe, expect, it } from "vitest";
import { actionFrequencyLabel } from "./BattleScene";

describe("전투 속도 표시", () => {
  it("속도를 적 1회당 내 행동 횟수로 바꿔 보여준다", () => {
    expect(actionFrequencyLabel(100, 50)).toMatch(/^적 1회당 내 \d+\.\d회$/);
  });
});
