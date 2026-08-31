// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  BulletinFeed,
  BulletinPost,
} from "@/adventure/bulletin/types";
import { RecentBulletinPreview } from "./RecentBulletinPreview";

const mocks = vi.hoisted(() => ({
  fetchPosts: vi.fn(),
}));

vi.mock("@/adventure/bulletin/api", () => ({
  fetchPosts: mocks.fetchPosts,
}));

const activity = {
  creditedPosts: 0,
  creditedComments: 0,
  receivedLikes: 0,
  level: 1,
  title: "새싹",
  points: 0,
  levelStartPoints: 0,
  nextLevelPoints: 10,
  progressPct: 0,
};

function post(
  id: number,
  category: BulletinPost["category"],
  title: string,
): BulletinPost {
  return {
    id,
    authorUserId: category === "notice" ? null : `user-${id}`,
    name: category === "notice" ? "운영자" : `사용자 ${id}`,
    avatar: null,
    profileBorder: null,
    className: "모험가",
    category,
    title,
    content: `${title} 내용`,
    createdAt: 1_787_609_600_000 - id,
    updatedAt: null,
    scope: "public",
    guildName: null,
    mine: false,
    likeCount: 0,
    commentCount: id,
    viewCount: 0,
    likedByMe: false,
    viewedByMe: false,
    authorActivity: category === "notice" ? null : activity,
  };
}

afterEach(() => {
  cleanup();
  mocks.fetchPosts.mockReset();
});

describe("RecentBulletinPreview", () => {
  it("공지를 제외한 최신 일반 게시글 네 개만 표시한다", async () => {
    const feed: BulletinFeed = {
      posts: [
        post(1, "notice", "서버 점검 공지"),
        post(2, "free", "자유 글 1"),
        post(3, "notice", "이벤트 공지"),
        post(4, "guide", "공략 글 2"),
        post(5, "free", "자유 글 3"),
        post(6, "free", "네 번째 일반 글"),
        post(7, "guide", "다섯 번째 일반 글"),
      ],
      myActivity: activity,
    };
    mocks.fetchPosts.mockResolvedValue(feed);

    render(<RecentBulletinPreview />);

    expect(await screen.findByText("자유 글 1")).not.toBeNull();
    expect(screen.getByText("공략 글 2")).not.toBeNull();
    expect(screen.getByText("자유 글 3")).not.toBeNull();
    expect(screen.queryByText("서버 점검 공지")).toBeNull();
    expect(screen.queryByText("이벤트 공지")).toBeNull();
    expect(screen.getByText("네 번째 일반 글")).not.toBeNull();
    expect(screen.queryByText("다섯 번째 일반 글")).toBeNull();
  });
});
