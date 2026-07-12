import { describe, expect, it } from "vitest";
import {
  deriveFeedbackAdminState,
  parseFeedbackAdminPatch,
  shouldNotifyFeedbackReply,
  type FeedbackAdminState,
} from "./feedbackAdminUpdate";

const OPEN: FeedbackAdminState = {
  adminReply: null,
  reviewedAt: null,
  repliedAt: null,
  resolvedAt: null,
  status: "open",
};

describe("feedback admin update", () => {
  it("확인 체크를 검토 완료 상태와 시각으로 변환한다", () => {
    const now = new Date("2026-07-12T00:00:00Z");
    expect(deriveFeedbackAdminState(OPEN, { id: 1, reviewed: true }, now)).toEqual({
      ...OPEN,
      reviewedAt: now,
      status: "reviewed",
    });
  });

  it("답변을 저장하면 자동으로 확인 및 처리 완료 상태가 된다", () => {
    const now = new Date("2026-07-12T00:00:00Z");
    expect(deriveFeedbackAdminState(OPEN, { id: 1, reply: "확인했습니다." }, now)).toEqual({
      adminReply: "확인했습니다.",
      reviewedAt: now,
      repliedAt: now,
      resolvedAt: now,
      status: "resolved",
    });
  });

  it("공백 답변은 기존 답변을 지우되 확인 상태는 유지한다", () => {
    const reviewedAt = new Date("2026-07-11T00:00:00Z");
    const current: FeedbackAdminState = {
      adminReply: "옛 답변",
      reviewedAt,
      repliedAt: reviewedAt,
      resolvedAt: reviewedAt,
      status: "resolved",
    };
    expect(deriveFeedbackAdminState(current, { id: 1, reply: "  " })).toMatchObject({
      adminReply: null,
      reviewedAt,
      repliedAt: null,
      resolvedAt: null,
      status: "reviewed",
    });
  });

  it("잘못된 ID와 지나치게 긴 답변을 거절한다", () => {
    expect(parseFeedbackAdminPatch({ id: 0, reviewed: true })).toEqual({
      ok: false,
      error: "bad_id",
    });
    expect(parseFeedbackAdminPatch({ id: 1, reply: "가".repeat(2_001) })).toEqual({
      ok: false,
      error: "reply_too_long",
    });
  });

  it("새 답변이나 변경된 답변에만 알림을 만든다", () => {
    expect(
      shouldNotifyFeedbackReply(null, { id: 1, reply: "답변" }, "답변"),
    ).toBe(true);
    expect(
      shouldNotifyFeedbackReply("답변", { id: 1, reply: "답변" }, "답변"),
    ).toBe(false);
    expect(
      shouldNotifyFeedbackReply("답변", { id: 1, reply: "" }, null),
    ).toBe(false);
    expect(
      shouldNotifyFeedbackReply(null, { id: 1, reviewed: true }, null),
    ).toBe(false);
  });
});
