import { describe, expect, it } from "vitest";
import {
  activityVerificationGateReducer,
  initialActivityVerificationGateState,
} from "./activityVerificationGateState";

describe("activityVerificationGateReducer", () => {
  it("검증 실패는 위젯을 자동 재생성하지 않고 사용자 재시도를 기다린다", () => {
    const checking = activityVerificationGateReducer(
      initialActivityVerificationGateState,
      { type: "submit" },
    );
    const failed = activityVerificationGateReducer(checking, { type: "failure" });
    const repeatedFailure = activityVerificationGateReducer(failed, {
      type: "failure",
    });

    expect(failed).toEqual({ status: "error", widgetGeneration: 0 });
    expect(repeatedFailure).toEqual(failed);

    expect(
      activityVerificationGateReducer(failed, { type: "retry" }),
    ).toEqual({ status: "ready", widgetGeneration: 1 });
  });
});
