"use client";

import { useEffect, useState } from "react";
import { ArrowRight, ChatsCircle } from "@phosphor-icons/react";
import { fetchPosts } from "@/adventure/bulletin/api";
import type { BulletinPost } from "@/adventure/bulletin/types";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";

export function RecentBulletinPreview() {
  const [posts, setPosts] = useState<BulletinPost[] | null>(null);
  useEffect(() => {
    let active = true;
    void fetchPosts("all", "")
      .then((feed) => {
        if (active) {
          setPosts(
            feed.posts.filter((post) => post.category !== "notice").slice(0, 3),
          );
        }
      })
      .catch(() => { if (active) setPosts([]); });
    return () => { active = false; };
  }, []);
  return (
    <section className={`${SURFACE_CARD} h-full p-4`} aria-labelledby="recent-bulletin-title">
      <div className="flex items-center justify-between gap-2">
        <h2 id="recent-bulletin-title" className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          <ChatsCircle size={19} className="text-sky-600" aria-hidden /> 최근 게시글
        </h2>
        <a href="/plaza/bulletin" className="flex min-h-11 items-center gap-1 px-1 text-xs font-medium text-indigo-700 dark:text-indigo-300">
          전체 보기 <ArrowRight size={14} aria-hidden />
        </a>
      </div>
      <div className="mt-2 space-y-1.5">
        {posts == null ? (
          <p className="py-3 text-xs text-zinc-500">게시글을 불러오는 중…</p>
        ) : posts.length === 0 ? (
          <p className="py-3 text-xs text-zinc-500">표시할 게시글이 없습니다.</p>
        ) : posts.map((post) => (
          <a key={post.id} href="/plaza/bulletin" className={`${SURFACE_INSET} block min-h-11 px-3 py-2 hover:ring-1 hover:ring-indigo-300`}>
            <span className="block truncate text-sm font-medium text-zinc-700 dark:text-zinc-200">{post.title || post.content}</span>
            <span className="block truncate text-[0.6875rem] text-zinc-500">{post.name} · 댓글 {post.commentCount}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
