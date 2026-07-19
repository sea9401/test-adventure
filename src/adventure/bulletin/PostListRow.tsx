"use client";

import { memo } from "react";
import {
  CaretRight,
  ChatCircle,
  Eye,
  Heart,
  UsersThree,
} from "@phosphor-icons/react";
import { formatDate } from "@/lib/notifications";
import { BULLETIN_CATEGORY_LABELS } from "@/lib/bulletin-config";
import { SURFACE_INSET } from "@/components/ui/surfaces";
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
  const excerpt = truncateOneLine(post.content, 90);

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(post.id)}
        className={`${SURFACE_INSET} group flex min-h-[76px] w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:border-emerald-400 hover:bg-white dark:hover:border-emerald-700 dark:hover:bg-zinc-800`}
      >
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
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
                className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                title={post.guildName ?? "길드 전용"}
              >
                <UsersThree size={11} weight="bold" />
                길드
              </span>
            )}
          </span>
          <span className="mt-1.5 block truncate text-xs leading-5 text-zinc-600 dark:text-zinc-400">
            {excerpt}
          </span>
          <span className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
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
            <span
              className="inline-flex shrink-0 items-center gap-0.5"
              aria-label={`댓글 ${post.commentCount}개`}
            >
              <ChatCircle size={11} weight="regular" />
              <span className="tabular-nums">{post.commentCount}</span>
            </span>
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
          </span>
        </span>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-300 text-zinc-400 transition-colors group-hover:border-emerald-500 group-hover:text-emerald-600 dark:border-zinc-700 dark:group-hover:border-emerald-600 dark:group-hover:text-emerald-400">
          <CaretRight size={15} weight="bold" />
        </span>
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
