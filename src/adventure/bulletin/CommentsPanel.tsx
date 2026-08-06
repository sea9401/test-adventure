"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowBendDownRight, Trash, X } from "@phosphor-icons/react";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatRelative } from "@/lib/notifications";
import { BULLETIN_COMMENT_MAX_LENGTH } from "@/lib/bulletin-config";
import {
  deleteComment,
  fetchComments,
  postComment,
} from "./api";
import type { BulletinComment } from "./types";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import { BulletinActivityBadge } from "./BulletinActivityBadge";
import {
  groupBulletinCommentThreads,
  removeBulletinCommentThread,
} from "./commentThreads";

// 댓글 패널 — 상세 페이지 하단에 항상 펼쳐진 상태로 노출. 마운트 시 목록 fetch,
// 작성/삭제 시 부모로 카운트 변화 통보. (옛 PostCard 인라인 펼침에서 분리)
export function CommentsPanel({
  postId,
  onCountChange,
  onTargetMessage,
}: {
  postId: number;
  onCountChange: (postId: number, count: number) => void;
  onTargetMessage: (name: string) => void;
}) {
  const [comments, setComments] = useState<BulletinComment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: number; name: string } | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const trimmed = draft.trim();
  const canSubmit =
    trimmed.length > 0 &&
    trimmed.length <= BULLETIN_COMMENT_MAX_LENGTH &&
    !submitting;

  useEffect(() => {
    let cancelled = false;
    fetchComments(postId)
      .then((rows) => {
        if (cancelled) return;
        setComments(rows);
        onCountChange(postId, rows.length);
      })
      .catch((e) => {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : "불러오기 실패");
      });
    return () => {
      cancelled = true;
    };
    // onCountChange 는 부모 setState closure — 마운트 시 1회만 fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setErr(null);
    try {
      const created = await postComment(postId, trimmed, replyTo?.id ?? null);
      setComments((prev) => {
        const next = prev ? [...prev, created] : [created];
        onCountChange(postId, next.length);
        return next;
      });
      setDraft("");
      setReplyTo(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "작성 실패";
      setErr(
        msg === "rate limited"
          ? "너무 빠르게 댓글을 달고 있어요. 잠시 후 다시 시도해주세요."
          : msg === "parent comment not found"
            ? "원댓글이 삭제되어 답글을 등록할 수 없어요."
            : msg,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (commentId: number) => {
    const replyCount =
      comments?.filter((comment) => comment.parentId === commentId).length ?? 0;
    const message =
      replyCount > 0
        ? `이 댓글과 답글 ${replyCount}개를 함께 삭제할까요?`
        : "이 댓글을 삭제할까요?";
    if (!confirm(message)) return;
    try {
      await deleteComment(postId, commentId);
      setComments((prev) => {
        const next = prev
          ? removeBulletinCommentThread(prev, commentId)
          : null;
        if (next) onCountChange(postId, next.length);
        return next;
      });
      setReplyTo((current) => (current?.id === commentId ? null : current));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "삭제 실패");
    }
  };

  const startReply = (comment: BulletinComment) => {
    setReplyTo({ id: comment.id, name: comment.name });
    setErr(null);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const renderComment = (comment: BulletinComment, isReply: boolean) => (
    <div className="flex items-start justify-between gap-2 px-1 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-1.5 text-[10px] text-zinc-500 dark:text-zinc-400">
          {isReply && (
            <ArrowBendDownRight
              size={12}
              weight="bold"
              className="shrink-0 self-center"
              aria-hidden
            />
          )}
          {comment.mine ? (
            <span className="font-semibold text-zinc-700 dark:text-zinc-200">
              {comment.name}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onTargetMessage(comment.name)}
              title="쪽지 보내기"
              className="rounded font-semibold text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-200"
            >
              {comment.name}
            </button>
          )}
          <BulletinActivityBadge activity={comment.authorActivity} />
          <span>{formatRelative(comment.createdAt)}</span>
        </div>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-zinc-800 dark:text-zinc-200">
          {comment.content}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {!isReply && (
          <button
            type="button"
            onClick={() => startReply(comment)}
            aria-label={`${comment.name}님에게 답글`}
            className="inline-flex min-h-8 items-center gap-0.5 rounded px-1.5 text-[10px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <ArrowBendDownRight size={12} weight="bold" aria-hidden />
            답글
          </button>
        )}
        {comment.mine && (
          <button
            type="button"
            onClick={() => remove(comment.id)}
            aria-label="댓글 삭제"
            className="shrink-0 rounded p-1 text-zinc-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
          >
            <Trash size={12} weight="bold" />
          </button>
        )}
      </div>
    </div>
  );

  const threads = comments ? groupBulletinCommentThreads(comments) : [];

  return (
    <div className="space-y-2">
      {comments === null ? (
        <Skeleton rows={2} />
      ) : comments.length === 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          아직 댓글이 없습니다.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {threads.map(({ root, replies }) => (
            <li key={root.id}>
              {renderComment(root, root.parentId !== null)}
              {replies.length > 0 && (
                <ul className="ml-4 mt-1 space-y-1 pl-2 sm:ml-6">
                  {replies.map((reply) => (
                    <li key={reply.id}>{renderComment(reply, true)}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {replyTo && (
        <div
          className={`${SURFACE_INSET} flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs text-zinc-600 dark:text-zinc-300`}
        >
          <span className="min-w-0 truncate">
            <strong className="font-semibold text-zinc-800 dark:text-zinc-100">
              {replyTo.name}
            </strong>
            님에게 답글 작성 중
          </span>
          <button
            type="button"
            onClick={() => setReplyTo(null)}
            aria-label="답글 작성 취소"
            className="shrink-0 rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <X size={13} weight="bold" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={1}
          maxLength={BULLETIN_COMMENT_MAX_LENGTH + 50}
          placeholder={replyTo ? `${replyTo.name}님에게 답글` : "댓글 달기"}
          disabled={submitting}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          className="min-h-[40px] flex-1 resize-none rounded-md border border-zinc-300 bg-white px-2.5 py-2 text-sm outline-none transition-colors focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-400"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="shrink-0 rounded-md border border-emerald-700 bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          등록
        </button>
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span
          className={
            trimmed.length > BULLETIN_COMMENT_MAX_LENGTH
              ? "text-rose-600"
              : "text-zinc-500 dark:text-zinc-400"
          }
        >
          {trimmed.length} / {BULLETIN_COMMENT_MAX_LENGTH}
        </span>
        {err && <span className="text-rose-600">{err}</span>}
      </div>
    </div>
  );
}
