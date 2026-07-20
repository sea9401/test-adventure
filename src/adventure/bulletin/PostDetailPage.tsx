"use client";

import { useState } from "react";
import {
  ArrowLeft,
  ChatCircle,
  Eye,
  Heart,
  Megaphone,
  PencilSimple,
  Trash,
  UsersThree,
} from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { CosmeticAvatar } from "@/components/ui/CosmeticAvatar";
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
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  onLikeUpdate: (postId: number, liked: boolean, count: number) => void;
  onCommentCountChange: (postId: number, count: number) => void;
  onRequestSendMessage: (name: string) => void;
};

function AuthorPortrait({ post }: { post: BulletinPost }) {
  const frameClass =
    "h-24 w-24 rounded-xl sm:h-[120px] sm:w-40";

  if (post.category === "notice") {
    return (
      <div
        className={`flex shrink-0 items-center justify-center overflow-hidden ${frameClass}`}
        aria-label="운영자 공지"
      >
        <Megaphone
          size={28}
          weight="duotone"
          className="text-rose-500 dark:text-rose-400"
        />
      </div>
    );
  }

  return (
    <CosmeticAvatar
      avatar={post.avatar ?? "male1"}
      name={post.name}
      profileBorder={post.profileBorder}
      width={160}
      height={120}
      sizes="(min-width: 640px) 160px, 96px"
      className={frameClass}
      imageClassName="object-contain"
    />
  );
}

export function PostDetailPage({
  post,
  onBack,
  onEdit,
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
      </div>

      <Card padding="none" className="-mx-2 px-5 py-4 sm:-mx-4 sm:px-6">
        <header className="border-b border-zinc-200 pb-4 dark:border-zinc-700">
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${CATEGORY_BADGE[post.category]}`}
                  >
                    {BULLETIN_CATEGORY_LABELS[post.category].name}
                  </span>
                  {post.scope === "guild" && (
                    <span className="inline-flex items-center gap-0.5 rounded-full border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                      <UsersThree size={11} weight="bold" />
                      {post.guildName == null
                        ? "길드 전용"
                        : `${post.guildName} 전용`}
                    </span>
                  )}
                </div>
                {post.mine && (
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => onEdit(post.id)}
                      aria-label="글 수정"
                      className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                    >
                      <PencilSimple size={14} weight="bold" />
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      aria-label="글 삭제"
                      className="rounded p-1 text-zinc-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                    >
                      <Trash size={14} weight="bold" />
                    </button>
                  </div>
                )}
              </div>

              <h2 className="mt-3 break-words text-2xl font-bold leading-snug text-zinc-950 dark:text-zinc-50 sm:text-3xl">
                {post.title && post.title.trim().length > 0
                  ? post.title
                  : "(제목 없음)"}
              </h2>

              <div className="mt-4 flex min-w-0 items-center gap-x-1.5 overflow-hidden whitespace-nowrap">
                {post.mine || post.category === "notice" ? (
                  // 공지(운영자)·본인 글은 쪽지 대상이 아니므로 평문으로만 표시.
                  <span className="min-w-0 truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                    {post.name}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onRequestSendMessage(post.name)}
                    title="쪽지 보내기"
                    className="min-w-0 truncate rounded text-sm font-semibold text-zinc-800 underline-offset-2 hover:underline dark:text-zinc-100"
                  >
                    {post.name}
                  </button>
                )}
                <span
                  className="shrink-0 text-[11px] text-zinc-500 dark:text-zinc-400"
                  aria-hidden="true"
                >
                  ·
                </span>
                <span className="shrink-0 text-[11px] text-zinc-500 dark:text-zinc-400">
                  {post.className}
                </span>
                <span
                  className="shrink-0 text-[11px] text-zinc-500 dark:text-zinc-400"
                  aria-hidden="true"
                >
                  ·
                </span>
                <span className="shrink-0 text-[11px] text-zinc-500 dark:text-zinc-400">
                  {formatDateTime(post.createdAt)}
                </span>
                {post.updatedAt != null && (
                  <span className="shrink-0 text-[11px] text-zinc-500 dark:text-zinc-400">
                    (수정됨)
                  </span>
                )}
              </div>
            </div>

            <AuthorPortrait post={post} />
          </div>
        </header>

        <p className="mt-4 whitespace-pre-wrap break-words text-[15px] leading-7 text-zinc-800 dark:text-zinc-200">
          {post.content}
        </p>

        <div className="mt-4 flex items-center gap-3 border-t border-zinc-200 pt-2 text-xs dark:border-zinc-700">
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

      <Card padding="md" className="-mx-2 sm:-mx-4">
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
