import type { BulletinCategory } from "@/lib/bulletin-config";

// 게시판 글 — 서버 응답 + 클라 표시용 공용 모델.
// likeCount/commentCount/likedByMe 는 GET /api/bulletin 의 서브쿼리로 함께 옴.
export type BulletinPost = {
  id: number;
  name: string;
  className: string;
  category: BulletinCategory;
  title: string | null;
  content: string;
  createdAt: number;
  // 작성자가 글을 수정한 시각 — 미수정이면 null. "(수정됨)" 표기 조건.
  updatedAt: number | null;
  scope: "public" | "guild";
  guildName: string | null;
  mine: boolean;
  likeCount: number;
  commentCount: number;
  viewCount: number;
  likedByMe: boolean;
};

// 댓글 — 서버 응답 그대로. mine 은 본인 작성 여부 (삭제 버튼 노출 조건).
export type BulletinComment = {
  id: number;
  name: string;
  className: string;
  content: string;
  createdAt: number;
  mine: boolean;
};

// 카테고리 배지 톤 — Tailwind 클래스 모음. PostListRow / PostDetailPage 공용.
export const CATEGORY_BADGE: Record<BulletinCategory, string> = {
  notice:
    "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
  free: "border-zinc-300 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
  guide:
    "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
};
