"use client";

import { memo } from "react";
import { ChatCircle, Eye, Heart, UsersThree } from "@phosphor-icons/react";
import { formatDate } from "@/lib/notifications";
import { BULLETIN_CATEGORY_LABELS } from "@/lib/bulletin-config";
import { CATEGORY_BADGE, type BulletinPost } from "./types";

// 게시판 목록의 한 줄 — 제목/작성자/시간 + 좋아요·댓글 카운트(읽기 전용).
// 좋아요 토글·본문·댓글은 상세 페이지에서. 행 전체가 버튼이라 모바일 탭 영역 충분.
//
// 옛 글(title=null, 새 제도로 받지 않게 됐지만 DB 잔존) 은 본문 첫 줄을 fallback 으로.
type Props = {
  post: BulletinPost;
  onOpen: (postId: number) => void;
};

function PostListRowImpl({ post, onOpen }: Props) {
  const displayTitle =
    post.title && post.title.trim().length > 0
      ? post.title
      : truncateOneLine(post.content, 40);
  const titleClass =
    post.title && post.title.trim().length > 0
      ? "font-medium text-zinc-900 dark:text-zinc-100"
      : "italic text-zinc-500 dark:text-zinc-400";

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(post.id)}
        className="flex w-full min-h-[44px] flex-col gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left transition-colors hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/60 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
      >
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${CATEGORY_BADGE[post.category]}`}
          >
            {BULLETIN_CATEGORY_LABELS[post.category].name}
          </span>
          <span className={`min-w-0 flex-1 truncate text-sm ${titleClass}`}>
            {displayTitle}
          </span>
          {post.scope === "guild" && (
            <span
              className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
              title={post.guildName ?? "길드 전용"}
            >
              <UsersThree size={11} weight="bold" />
              길드
            </span>
          )}
          {post.commentCount > 0 && (
            <span
              className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-zinc-500 dark:text-zinc-400"
              aria-label={`댓글 ${post.commentCount}개`}
            >
              <ChatCircle size={12} weight="regular" />
              <span className="tabular-nums">{post.commentCount}</span>
            </span>
          )}
        </div>
        <div className="flex min-w-0 items-baseline gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
          <span className="truncate font-medium text-zinc-700 dark:text-zinc-300">
            {post.name}
          </span>
          <span className="shrink-0">{formatDate(post.createdAt)}</span>
          <span
            className="ml-auto inline-flex shrink-0 items-center gap-0.5"
            aria-label={`조회 ${post.viewCount}회`}
          >
            <Eye size={11} weight="regular" />
            <span className="tabular-nums">{post.viewCount}</span>
          </span>
          {post.likeCount > 0 && (
            <span
              className="inline-flex shrink-0 items-center gap-0.5"
              aria-label={`좋아요 ${post.likeCount}개`}
            >
              <Heart
                size={11}
                weight={post.likedByMe ? "fill" : "regular"}
                className={post.likedByMe ? "text-rose-500" : ""}
              />
              <span className="tabular-nums">{post.likeCount}</span>
            </span>
          )}
        </div>
      </button>
    </li>
  );
}

function truncateOneLine(s: string, max: number): string {
  const firstLine = s.split("\n").find((l) => l.trim().length > 0) ?? s;
  const trimmed = firstLine.trim();
  return trimmed.length > max ? trimmed.slice(0, max) + "…" : trimmed;
}

// memo — 부모가 콜백을 useCallback 으로 안정화하면 같은 post 인 row 는 렌더 skip.
export const PostListRow = memo(PostListRowImpl);
