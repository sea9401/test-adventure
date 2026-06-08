import type { BulletinCategory } from "@/lib/bulletin-config";
import type { BulletinComment, BulletinPost } from "./types";

// 게시판 클라이언트 API helper — 모든 fetch 호출을 한 곳에 모아 라우트 경로/메서드
// 변경 시 검색 영역을 좁힌다. UI 컴포넌트는 fetch 디테일을 모르고 이 함수만 호출.

export async function fetchPosts(
  category: BulletinCategory,
  q: string,
): Promise<BulletinPost[]> {
  const params = new URLSearchParams({ category });
  if (q) params.set("q", q);
  const res = await fetch(`/api/bulletin?${params.toString()}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchPermissions(): Promise<{ isAdmin: boolean }> {
  const res = await fetch("/api/bulletin/permissions", { cache: "no-store" });
  if (!res.ok) return { isAdmin: false };
  return res.json();
}

export async function postPost(input: {
  category: BulletinCategory;
  title: string | null;
  content: string;
}): Promise<BulletinPost> {
  const res = await fetch("/api/bulletin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `post failed: ${res.status}`);
  }
  return res.json();
}

export async function deletePost(id: number): Promise<void> {
  const res = await fetch(`/api/bulletin?id=${id}`, { method: "DELETE" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `delete failed: ${res.status}`);
  }
}

export async function toggleLike(
  postId: number,
): Promise<{ liked: boolean; count: number }> {
  const res = await fetch(`/api/bulletin/${postId}/like`, { method: "POST" });
  if (!res.ok) throw new Error(`like failed: ${res.status}`);
  return res.json();
}

// 조회 기록(유저당 1회) — 상세 열람 시 호출. 응답: { count } 고유 조회수.
export async function recordView(
  postId: number,
): Promise<{ count: number }> {
  const res = await fetch(`/api/bulletin/${postId}/view`, { method: "POST" });
  if (!res.ok) throw new Error(`view failed: ${res.status}`);
  return res.json();
}

export async function fetchComments(
  postId: number,
): Promise<BulletinComment[]> {
  const res = await fetch(`/api/bulletin/${postId}/comments`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`fetch comments failed: ${res.status}`);
  return res.json();
}

export async function postComment(
  postId: number,
  content: string,
): Promise<BulletinComment> {
  const res = await fetch(`/api/bulletin/${postId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `post comment failed: ${res.status}`);
  }
  return res.json();
}

export async function deleteComment(
  postId: number,
  commentId: number,
): Promise<void> {
  const res = await fetch(
    `/api/bulletin/${postId}/comments/${commentId}`,
    { method: "DELETE" },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `delete comment failed: ${res.status}`);
  }
}
