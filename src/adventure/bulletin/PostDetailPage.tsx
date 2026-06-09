"use client";

import { useState } from "react";
import {
  ArrowLeft,
  ChatCircle,
  Eye,
  Heart,
  Trash,
} from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { formatDateTime } from "@/lib/notifications";
import { BULLETIN_CATEGORY_LABELS } from "@/lib/bulletin-config";
import { toggleLike } from "./api";
import { CommentsPanel } from "./CommentsPanel";
import { CATEGORY_BADGE, type BulletinPost } from "./types";

// 게시판 글 상세 — 목록에서 한 글 클릭 시 같은 view 영역 안에서 전환되는 페이지.
// 본문 전체 + 좋아요 토글 + 항상 펼쳐진 댓글 패널 + 뒤로 가기.
type Props = {
  post: BulletinPost;
  onBack: () => void;
  onDelete: (id: number) => void;
  onLikeUpdate: (postId: number, liked: boolean, count: number) => void;
  onCommentCountChange: (postId: number, count: number) => void;
  onRequestSendMessage: (name: string) => void;
};

export function PostDetailPage({
  post,
  onBack,
  onDelete,
  onLikeUpdate,
  onCommentCountChange,
  onRequestSendMessage,
}: Props) {
  const [likeBusy, setLikeBusy] = useState(false);

  const handleLike = async () => {
    if (likeBusy) return;
    setLikeBusy(true);
    const beforeLiked = post.likedByMe;
    const beforeCount = post.likeCount;
    onLikeUpdate(
      post.id,
      !beforeLiked,
      beforeCount + (beforeLiked ? -1 : 1),
    );
    try {
      const next = await toggleLike(post.id);
      onLikeUpdate(post.id, next.liked, next.count);
    } catch {
      onLikeUpdate(post.id, beforeLiked, beforeCount);
    } finally {
      setLikeBusy(false);
    }
  };

  const handleDelete = () => onDelete(post.id);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="목록으로"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          <ArrowLeft size={18} weight="bold" />
        </button>
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {post.title && post.title.trim().length > 0
            ? post.title
            : "(제목 없음)"}
        </h2>
      </div>

      <Card padding="md">
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex flex-wrap items-baseline gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            <span
              className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${CATEGORY_BADGE[post.category]}`}
            >
              {BULLETIN_CATEGORY_LABELS[post.category].name}
            </span>
            {post.mine || post.category === "notice" ? (
              // 공지(운영자)·본인 글은 쪽지 대상이 아니므로 평문으로만 표시.
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                {post.name}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onRequestSendMessage(post.name)}
                title="쪽지 보내기"
                className="rounded font-semibold text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-200"
              >
                {post.name}
              </button>
            )}
            <span>{formatDateTime(post.createdAt)}</span>
          </div>
          {post.mine && (
            <button
              type="button"
              onClick={handleDelete}
              aria-label="글 삭제"
              className="shrink-0 rounded p-1 text-zinc-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
            >
              <Trash size={14} weight="bold" />
            </button>
          )}
        </div>

        <p className="mt-3 whitespace-pre-wrap break-words text-sm text-zinc-800 dark:text-zinc-200">
          {post.content}
        </p>

        <div className="mt-4 flex items-center gap-3 text-xs">
          <button
            type="button"
            onClick={handleLike}
            disabled={likeBusy}
            aria-pressed={post.likedByMe}
            aria-label={post.likedByMe ? "좋아요 취소" : "좋아요"}
            className={`inline-flex min-h-[40px] items-center gap-1 rounded-md px-3 py-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              post.likedByMe
                ? "text-rose-600 dark:text-rose-400"
                : "text-zinc-500 hover:text-rose-500 dark:text-zinc-400 dark:hover:text-rose-400"
            }`}
          >
            <Heart
              size={14}
              weight={post.likedByMe ? "fill" : "regular"}
            />
            <span className="tabular-nums">{post.likeCount}</span>
          </button>
          <div className="inline-flex items-center gap-1 px-2 py-1 text-zinc-500 dark:text-zinc-400">
            <ChatCircle size={14} weight="regular" />
            <span className="tabular-nums">{post.commentCount}</span>
          </div>
          <div
            className="inline-flex items-center gap-1 px-2 py-1 text-zinc-500 dark:text-zinc-400"
            aria-label={`조회 ${post.viewCount}회`}
          >
            <Eye size={14} weight="regular" />
            <span className="tabular-nums">{post.viewCount}</span>
          </div>
        </div>
      </Card>

      <Card padding="md">
        <div className="mb-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
          댓글 {post.commentCount}
        </div>
        <CommentsPanel
          postId={post.id}
          onCountChange={onCommentCountChange}
          onTargetMessage={onRequestSendMessage}
        />
      </Card>
    </div>
  );
}
