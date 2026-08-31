import { describe, expect, it } from "vitest";
import {
  feedbackHistoryApiHref,
  feedbackIdFromHash,
  feedbackReplyHref,
  feedbackSelectionFromHash,
  isFeedbackTargetMissing,
} from "./feedbackNavigation";

describe("건의 답변 이동", () => {
  it("대상 건의 링크와 조회 주소를 만든다", () => {
    expect(feedbackReplyHref(7)).toBe("/feedback#feedback-7");
    expect(feedbackIdFromHash("#feedback-7")).toBe(7);
    expect(feedbackHistoryApiHref(7)).toBe("/api/feedback?targetId=7");
  });

  it("비정상 번호와 해시는 대상 없는 주소로 정규화한다", () => {
    expect(feedbackReplyHref(0)).toBe("/feedback");
    expect(feedbackIdFromHash("#feedback-0")).toBeNull();
    expect(feedbackIdFromHash("#feedback-7-extra")).toBeNull();
    expect(feedbackHistoryApiHref(null)).toBe("/api/feedback");
  });

  it("외부 답변 해시를 조회 대상과 펼침 대상으로 변환한다", () => {
    expect(feedbackSelectionFromHash("#feedback-91")).toEqual({
      targetId: 91,
      expandedId: 91,
    });
    expect(feedbackSelectionFromHash("#invalid")).toEqual({
      targetId: null,
      expandedId: null,
    });
  });

  it("대상 번호가 응답 목록에 없을 때만 누락으로 판정한다", () => {
    expect(isFeedbackTargetMissing(7, [])).toBe(true);
    expect(isFeedbackTargetMissing(7, [{ id: 7 }])).toBe(false);
    expect(isFeedbackTargetMissing(null, [])).toBe(false);
  });
});
