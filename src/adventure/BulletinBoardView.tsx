"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MagnifyingGlass,
  Megaphone,
  Note,
  PaperPlaneTilt,
} from "@phosphor-icons/react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Pagination } from "@/components/ui/Pagination";
import { TabBar } from "@/components/ui/TabBar";
import { usePagination } from "@/lib/usePagination";
import {
  BULLETIN_CATEGORIES,
  BULLETIN_CATEGORY_LABELS,
  type BulletinCategory,
} from "@/lib/bulletin-config";
import { SendMessageModal } from "@/adventure/marketplace/SendMessageModal";
import {
  deletePost,
  editPost,
  fetchPermissions,
  fetchPosts,
  postPost,
  recordView,
} from "./bulletin/api";
import { ComposePage } from "./bulletin/ComposePage";
import { PostListRow } from "./bulletin/PostListRow";
import { PostDetailPage } from "./bulletin/PostDetailPage";
import type { BulletinPost } from "./bulletin/types";

// 게시판 본체 — 탭(카테고리) + 검색 + 제목 목록 + 페이지네이션, 그리고 글쓰기/상세 화면 전환 라우터.
// 목록은 제목·작성자·시간·카운트만 한 줄로 (PostListRow). 클릭 시 상세 페이지로 본문+댓글 풀로 노출.
// 별도 라우트 대신 같은 view 안에서 mode 전환 — PlazaScreen 의 subView=bulletin 한 자리에서 처리.
type Mode =
  | { kind: "list" }
  | { kind: "compose" }
  | { kind: "detail"; postId: number }
  | { kind: "edit"; postId: number };

export function BulletinBoardView() {
  const [category, setCategory] = useState<BulletinCategory>("notice");
  const [search, setSearch] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [posts, setPosts] = useState<BulletinPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [pmTarget, setPmTarget] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // 검색어 debounce — 입력마다 fetch 하지 않고 250ms 멈춤 후 1회.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchPosts(category, debouncedQ);
      setPosts(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오기 실패");
    }
  }, [category, debouncedQ]);

  useEffect(() => {
    // 카테고리/검색어 변경마다 fetch — 명시적 의존 외부 변경.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPosts(null);
    refresh();
  }, [refresh]);

  // 권한 — 마운트 1회.
  useEffect(() => {
    fetchPermissions()
      .then((p) => setIsAdmin(p.isAdmin))
      .catch(() => setIsAdmin(false));
  }, []);

  const handleSubmit = async (input: {
    category: BulletinCategory;
    title: string;
    content: string;
  }) => {
    try {
      const created = await postPost(input);
      // 작성한 카테고리가 현재 탭과 같으면 즉시 반영, 다르면 그 탭으로 이동.
      if (created.category === category) {
        setPosts((prev) => (prev ? [created, ...prev] : [created]));
      } else {
        setCategory(created.category);
      }
      setMode({ kind: "list" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "작성 실패";
      if (msg === "rate limited") {
        throw new Error("너무 자주 글을 올리고 있어요. 잠시 후 다시 시도해주세요.");
      }
      if (msg === "forbidden") {
        throw new Error("이 카테고리에 글을 쓸 권한이 없어요.");
      }
      if (msg === "empty title") {
        throw new Error("제목을 입력해주세요.");
      }
      throw new Error(msg);
    }
  };

  // 수정 제출 — 성공 시 목록 상태에 변경분 머지 후 상세 화면으로 복귀.
  const handleEditSubmit = useCallback(
    async (postId: number, input: { title: string; content: string }) => {
      try {
        const updated = await editPost(postId, input);
        setPosts(
          (prev) =>
            prev?.map((p) =>
              p.id === postId
                ? {
                    ...p,
                    title: updated.title,
                    content: updated.content,
                    updatedAt: updated.updatedAt,
                  }
                : p,
            ) ?? null,
        );
        setMode({ kind: "detail", postId });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "수정 실패";
        if (msg === "not found or not owner") {
          throw new Error("본인이 작성한 글만 수정할 수 있어요.");
        }
        if (msg === "empty title") {
          throw new Error("제목을 입력해주세요.");
        }
        throw new Error(msg);
      }
    },
    [],
  );

  // PostListRow / PostDetailPage 가 콜백을 prop 으로 받으니 useCallback 으로 안정화.
  // memo 가 같은 post 인 행은 렌더 skip 하도록.
  const handleDelete = useCallback(async (id: number) => {
    if (!confirm("이 글을 삭제할까요?")) return;
    try {
      await deletePost(id);
      setPosts((prev) => prev?.filter((p) => p.id !== id) ?? null);
      // 상세 화면에서 삭제했으면 목록으로 자동 복귀.
      setMode((m) =>
        m.kind === "detail" && m.postId === id ? { kind: "list" } : m,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제 실패");
    }
  }, []);

  const handleLikeUpdate = useCallback(
    (postId: number, liked: boolean, count: number) => {
      setPosts(
        (prev) =>
          prev?.map((p) =>
            p.id === postId ? { ...p, likedByMe: liked, likeCount: count } : p,
          ) ?? null,
      );
    },
    [],
  );

  const handleCommentCountChange = useCallback(
    (postId: number, count: number) => {
      setPosts(
        (prev) =>
          prev?.map((p) =>
            p.id === postId ? { ...p, commentCount: count } : p,
          ) ?? null,
      );
    },
    [],
  );

  const handleRequestSendMessage = useCallback((name: string) => {
    setPmTarget(name);
  }, []);

  const handleViewCount = useCallback((postId: number, count: number) => {
    setPosts(
      (prev) =>
        prev?.map((p) =>
          p.id === postId ? { ...p, viewCount: count } : p,
        ) ?? null,
    );
  }, []);

  const handleOpenDetail = useCallback(
    (postId: number) => {
      setMode({ kind: "detail", postId });
      // 조회 기록(유저당 1회, 서버 dedupe) — 성공 시 고유 조회수 반영. 실패는 무시(비핵심).
      recordView(postId)
        .then((r) => handleViewCount(postId, r.count))
        .catch(() => {});
    },
    [handleViewCount],
  );

  const handleBackToList = useCallback(() => {
    setMode({ kind: "list" });
  }, []);

  const handleOpenEdit = useCallback((postId: number) => {
    setMode({ kind: "edit", postId });
  }, []);

  const pager = usePagination(posts ?? [], 15);

  const tabs = useMemo(
    () =>
      BULLETIN_CATEGORIES.map((c) => ({
        key: c,
        label: BULLETIN_CATEGORY_LABELS[c].name,
      })),
    [],
  );

  if (mode.kind === "compose") {
    return (
      <ComposePage
        initialCategory={category === "notice" && !isAdmin ? "free" : category}
        isAdmin={isAdmin}
        onCancel={() => setMode({ kind: "list" })}
        onSubmit={handleSubmit}
      />
    );
  }

  // 상세/수정 — 둘 다 현재 목록 상태에서 글을 찾아 그린다 (못 찾으면 공통 fallback).
  if (mode.kind === "detail" || mode.kind === "edit") {
    const post = posts?.find((p) => p.id === mode.postId);
    if (!post) {
      // posts 가 다시 로딩 중이거나(탭/검색 전환) 글이 사라진 경우 — 목록으로 안전 복귀.
      return (
        <div className="space-y-3">
          <Card padding="sm">
            <div className="text-sm text-zinc-600 dark:text-zinc-300">
              글을 찾을 수 없어요.
            </div>
          </Card>
          <button
            type="button"
            onClick={handleBackToList}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            목록으로
          </button>
        </div>
      );
    }
    if (mode.kind === "edit") {
      return (
        <ComposePage
          initialCategory={post.category}
          isAdmin={isAdmin}
          editing={{ title: post.title ?? "", content: post.content }}
          onCancel={() => setMode({ kind: "detail", postId: post.id })}
          onSubmit={(input) => handleEditSubmit(post.id, input)}
        />
      );
    }
    return (
      <>
        <PostDetailPage
          post={post}
          onBack={handleBackToList}
          onEdit={handleOpenEdit}
          onDelete={handleDelete}
          onLikeUpdate={handleLikeUpdate}
          onCommentCountChange={handleCommentCountChange}
          onRequestSendMessage={handleRequestSendMessage}
        />
        {pmTarget && (
          <SendMessageModal
            initialRecipient={pmTarget}
            onClose={() => setPmTarget(null)}
          />
        )}
      </>
    );
  }

  return (
    <div className="space-y-3">
      <TabBar
        tabs={tabs}
        active={category}
        onChange={setCategory}
        ariaLabel="게시판 카테고리"
        size="sm"
        scrollable
      />

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {BULLETIN_CATEGORY_LABELS[category].description}
      </p>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <MagnifyingGlass
            size={14}
            weight="bold"
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="제목·내용 검색"
            className="w-full rounded-md border border-zinc-300 bg-white py-1.5 pl-7 pr-3 text-sm outline-none transition-colors focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-400"
          />
        </div>
        <button
          type="button"
          onClick={() => setMode({ kind: "compose" })}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-emerald-700 bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
        >
          <PaperPlaneTilt size={14} weight="fill" />
          글쓰기
        </button>
      </div>

      {error ? (
        <Card padding="sm">
          <div className="text-sm text-rose-600 dark:text-rose-400">
            {error}
          </div>
        </Card>
      ) : null}

      {posts === null ? (
        <ul className="space-y-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <li
              key={i}
              className="rounded-lg border border-zinc-200 bg-white/70 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950/60"
            >
              <Skeleton rows={2} />
            </li>
          ))}
        </ul>
      ) : posts.length === 0 ? (
        <EmptyState
          icon={
            category === "notice" ? (
              <Megaphone size={40} weight="duotone" />
            ) : (
              <Note size={40} weight="duotone" />
            )
          }
          title={
            debouncedQ
              ? "검색 결과가 없습니다"
              : category === "notice"
                ? "공지가 없습니다"
                : "아직 글이 없습니다"
          }
          message={
            debouncedQ
              ? "다른 검색어를 시도해 보세요."
              : category === "notice"
                ? "운영자가 새 공지를 올리면 여기에 표시됩니다."
                : "첫 글을 남겨 보세요."
          }
        />
      ) : (
        <>
          <ul className="space-y-1.5">
            {pager.pageItems.map((p) => (
              <PostListRow key={p.id} post={p} onOpen={handleOpenDetail} />
            ))}
          </ul>
          <Pagination
            page={pager.page}
            pageCount={pager.pageCount}
            setPage={pager.setPage}
          />
        </>
      )}

      {pmTarget && (
        <SendMessageModal
          initialRecipient={pmTarget}
          onClose={() => setPmTarget(null)}
        />
      )}
    </div>
  );
}
