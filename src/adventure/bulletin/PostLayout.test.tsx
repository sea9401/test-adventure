import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { deriveBulletinActivity } from "@/lib/bulletinActivity";
import { PostDetailPage } from "./PostDetailPage";
import { PostListRow } from "./PostListRow";
import type { BulletinPost } from "./types";

const post: BulletinPost = {
  id: 1,
  name: "춘추전국시대",
  avatar: null,
  profileBorder: null,
  className: "광장지기",
  category: "free",
  title: "모바일 작성자 표시 확인",
  content: "본문",
  createdAt: Date.UTC(2026, 7, 5),
  updatedAt: null,
  scope: "public",
  guildName: null,
  mine: false,
  likeCount: 3,
  commentCount: 2,
  viewCount: 10,
  likedByMe: false,
  authorActivity: deriveBulletinActivity({
    creditedPosts: 100,
    creditedComments: 100,
    receivedLikes: 100,
  }),
};

describe("게시판 모바일 작성자 레이아웃", () => {
  it("목록에서 작성자 이름을 줄이지 않고 부가 정보를 다음 줄로 보낼 수 있다", () => {
    const html = renderToStaticMarkup(
      <PostListRow post={post} onOpen={vi.fn()} />,
    );

    expect(html).toContain("춘추전국시대");
    expect(html).toContain("flex min-w-0 flex-wrap items-baseline");
    expect(html).toContain("max-w-full shrink-0 break-all font-medium");
  });

  it("상세에서 모바일 작성자 행이 프로필 아래 전체 너비를 사용한다", () => {
    const html = renderToStaticMarkup(
      <PostDetailPage
        post={post}
        onBack={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onLikeUpdate={vi.fn()}
        onCommentCountChange={vi.fn()}
        onRequestSendMessage={vi.fn()}
      />,
    );

    expect(html).toContain("col-span-2 row-start-2 flex min-w-0 flex-wrap");
    expect(html).toContain(
      "max-w-full shrink-0 break-all rounded text-sm font-semibold",
    );
    expect(html).not.toContain("min-w-0 truncate rounded text-sm font-semibold");
  });
});
