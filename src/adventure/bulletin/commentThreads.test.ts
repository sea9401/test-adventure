import { describe, expect, it } from "vitest";
import type { BulletinComment } from "./types";
import {
  groupBulletinCommentThreads,
  removeBulletinCommentThread,
} from "./commentThreads";

function comment(id: number, parentId: number | null): BulletinComment {
  return {
    id,
    parentId,
    name: `작성자${id}`,
    className: "모험가",
    content: `댓글${id}`,
    createdAt: id,
    mine: false,
    authorActivity: {
      creditedPosts: 0,
      creditedComments: 0,
      receivedLikes: 0,
      level: 1,
      title: "새싹",
      points: 0,
      levelStartPoints: 0,
      nextLevelPoints: 10,
      progressPct: 0,
    },
  };
}

describe("groupBulletinCommentThreads", () => {
  it("시간순 응답의 답글을 원댓글 바로 아래로 묶는다", () => {
    const grouped = groupBulletinCommentThreads([
      comment(1, null),
      comment(2, null),
      comment(3, 1),
      comment(4, 2),
      comment(5, 1),
    ]);

    expect(grouped.map((thread) => thread.root.id)).toEqual([1, 2]);
    expect(grouped[0]?.replies.map((reply) => reply.id)).toEqual([3, 5]);
    expect(grouped[1]?.replies.map((reply) => reply.id)).toEqual([4]);
  });

  it("부모가 없는 답글도 화면에서 사라지지 않게 독립 항목으로 남긴다", () => {
    const grouped = groupBulletinCommentThreads([comment(3, 99)]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.root.id).toBe(3);
  });
});

describe("removeBulletinCommentThread", () => {
  it("원댓글을 지우면 직속 답글도 함께 제거한다", () => {
    const next = removeBulletinCommentThread(
      [comment(1, null), comment(2, 1), comment(3, null)],
      1,
    );

    expect(next.map((entry) => entry.id)).toEqual([3]);
  });

  it("답글만 지우면 다른 댓글은 유지한다", () => {
    const next = removeBulletinCommentThread(
      [comment(1, null), comment(2, 1), comment(3, null)],
      2,
    );

    expect(next.map((entry) => entry.id)).toEqual([1, 3]);
  });
});
