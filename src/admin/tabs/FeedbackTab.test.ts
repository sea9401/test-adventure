import { describe, expect, it } from "vitest";
import {
  feedbackEntriesForTab,
  type FeedbackEntry,
} from "./FeedbackTab";

function entry(id: number, reviewedAt: string | null): FeedbackEntry {
  return {
    id,
    userId: `user-${id}`,
    actorName: `모험가${id}`,
    currentGameName: null,
    email: null,
    category: "suggestion",
    content: `건의 ${id}`,
    hasImage: false,
    path: null,
    status: reviewedAt ? "reviewed" : "open",
    adminReply: null,
    reviewedAt,
    repliedAt: null,
    createdAt: "2026-08-04T00:00:00.000Z",
  };
}

describe("FeedbackTab review filters", () => {
  it("separates unchecked and reviewed feedback by reviewedAt", () => {
    const entries = [
      entry(3, null),
      entry(2, "2026-08-04T01:00:00.000Z"),
      entry(1, null),
    ];

    expect(feedbackEntriesForTab(entries, "unreviewed").map((item) => item.id)).toEqual([
      3, 1,
    ]);
    expect(feedbackEntriesForTab(entries, "reviewed").map((item) => item.id)).toEqual([2]);
  });
});
