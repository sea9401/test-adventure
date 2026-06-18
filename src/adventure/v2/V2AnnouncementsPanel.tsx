"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CaretRight, Megaphone } from "@phosphor-icons/react";
import { formatRelative } from "@/lib/notifications";
import { fetchPosts } from "@/adventure/bulletin/api";
import type { BulletinPost } from "@/adventure/bulletin/types";

// 모험 탭 — 캐릭 카드 아래 읽기 전용 공지 패널. 게시판 notice 카테고리 최근 3개를
// 그대로 끌어와 보여준다 (별도 데이터 소스 없이 /api/bulletin 재사용). 행/헤더 클릭 시
// 전체 게시판(/plaza/bulletin, 기본 탭이 공지)으로 이동해 본문을 본다.

const PREVIEW_COUNT = 3;

export function V2AnnouncementsPanel() {
  const router = useRouter();
  const [posts, setPosts] = useState<BulletinPost[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchPosts("notice", "")
      .then((list) => {
        if (alive) setPosts(list.slice(0, PREVIEW_COUNT));
      })
      .catch(() => {
        // 공지는 부가 표시 — 실패해도 모험 탭 본체에 영향 주지 않게 흡수.
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // 로딩 실패는 조용히 숨김 (카드 자체를 안 그림).
  if (failed) return null;

  const goToBoard = () => router.push("/plaza/bulletin");

  return (
    <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-center gap-2">
        <Megaphone
          size={16}
          weight="fill"
          className="shrink-0 text-rose-500"
        />
        <h2 className="text-base font-semibold text-zinc-800 dark:text-zinc-100">
          공지사항
        </h2>
        <button
          type="button"
          onClick={goToBoard}
          className="ml-auto inline-flex items-center text-xs text-zinc-500 transition-colors hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          전체보기
          <CaretRight size={12} weight="bold" />
        </button>
      </div>

      {posts === null ? (
        <p className="mt-3 text-sm text-zinc-400 dark:text-zinc-500">
          불러오는 중…
        </p>
      ) : posts.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
          등록된 공지가 없습니다.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-800">
          {posts.map((post) => (
            <li key={post.id}>
              <button
                type="button"
                onClick={goToBoard}
                className="flex w-full min-h-[40px] items-center gap-2 py-2 text-left transition-colors hover:opacity-80"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-zinc-700 dark:text-zinc-200">
                  {post.title?.trim() || "(제목 없음)"}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-zinc-400 dark:text-zinc-500">
                  {formatRelative(post.createdAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
