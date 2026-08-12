import { describe, expect, it } from "vitest";
import { stormExpeditionEntryActions } from "./stormExpeditionViewModel";

describe("stormExpeditionEntryActions", () => {
  it("입장 횟수가 남으면 실전과 연습을 모두 시작할 수 있다", () => {
    expect(stormExpeditionEntryActions(2)).toEqual({
      normal: { enabled: true, label: "실전 출발" },
      practice: {
        enabled: true,
        label: "연습 시작",
        description: "입장 횟수 소모 없음 · 보상 없음",
      },
    });
  });

  it("입장 횟수가 없어도 연습 시작은 유지한다", () => {
    expect(stormExpeditionEntryActions(0)).toEqual({
      normal: { enabled: false, label: "오늘 입장 완료" },
      practice: {
        enabled: true,
        label: "연습 시작",
        description: "입장 횟수 소모 없음 · 보상 없음",
      },
    });
  });
});
