import type { BulletinCategory } from "@/lib/bulletin-config";
import type { BulletinComment, BulletinPost } from "./types";

// 게시판 클라이언트 API helper — 모든 fetch 호출을 한 곳에 모아 라우트 경로/메서드
// 변경 시 검색 영역을 좁힌다. UI 컴포넌트는 fetch 디테일을 모르고 이 함수만 호출.

// category "all" = "전체" 탭 — category 파라미터를 빼면 서버가 모든 카테고리를 반환.
export async function fetchPosts(
  category: BulletinCategory | "all",
  q: string,
): Promise<BulletinPost[]> {
  const params = new URLSearchParams();
  if (category !== "all") params.set("category", category);
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

// 글 수정 — 작성자 본인만 (서버에서 검증). 카테고리는 수정 불가.
// 응답은 변경분만: { id, title, content, updatedAt }.
export async function editPost(
  id: number,
  input: { title: string; content: string },
): Promise<{ id: number; title: string; content: string; updatedAt: number }> {
  const res = await fetch("/api/bulletin", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...input }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `edit failed: ${res.status}`);
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
