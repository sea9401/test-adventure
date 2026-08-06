import { afterEach, describe, expect, it, vi } from "vitest";
import { postComment } from "./api";

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
