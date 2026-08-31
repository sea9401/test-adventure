import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchNoticePreview, postComment } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("postComment", () => {
  it("답글 대상 댓글 ID를 요청 본문에 전달한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 9, parentId: 3 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await postComment(7, "답글 내용", 3);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/bulletin/7/comments");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      content: "답글 내용",
      parentId: 3,
    });
  });

  it("일반 댓글은 parentId를 null로 전달한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 10, parentId: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await postComment(7, "일반 댓글");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      content: "일반 댓글",
      parentId: null,
    });
  });
});

describe("fetchNoticePreview", () => {
  it("홈 공지용 축약 조회를 사용하고 요약 게시글 배열을 반환한다", async () => {
    const posts = [
      { id: 9, title: "점검 안내", createdAt: 1_786_353_600_000 },
    ];
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ posts }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchNoticePreview()).resolves.toEqual(posts);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bulletin?preview=notice",
      { cache: "no-store" },
    );
  });
});
