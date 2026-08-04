import type { BulletinComment } from "./types";

export type BulletinCommentThread = {
  root: BulletinComment;
  replies: BulletinComment[];
};

/**
 * API의 시간순 댓글 목록을 최상위 댓글 + 한 단계 답글 묶음으로 바꾼다.
 * FK 이전/비정상 데이터로 부모가 없는 답글이 와도 댓글 자체는 숨기지 않는다.
 */
export function groupBulletinCommentThreads(
  comments: readonly BulletinComment[],
): BulletinCommentThread[] {
  const threads: BulletinCommentThread[] = [];
  const byRootId = new Map<number, BulletinCommentThread>();

  for (const comment of comments) {
    if (comment.parentId !== null) continue;
    const thread = { root: comment, replies: [] };
    threads.push(thread);
    byRootId.set(comment.id, thread);
  }

  for (const comment of comments) {
    if (comment.parentId === null) continue;
    const parent = byRootId.get(comment.parentId);
    if (parent) {
      parent.replies.push(comment);
    } else {
      threads.push({ root: comment, replies: [] });
    }
  }

  return threads;
}

/** 원댓글 삭제는 DB cascade와 동일하게 바로 아래 답글까지 로컬 목록에서 제거한다. */
export function removeBulletinCommentThread(
  comments: readonly BulletinComment[],
  commentId: number,
): BulletinComment[] {
  return comments.filter(
    (comment) => comment.id !== commentId && comment.parentId !== commentId,
  );
}
