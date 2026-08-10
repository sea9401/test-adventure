import { describe, expect, it, vi } from "vitest";
import { readNoticePreview } from "./preview";

describe("readNoticePreview", () => {
  it("공개 공지 최신 3개의 ID·제목·작성 시각만 반환한다", async () => {
    const limit = vi.fn().mockResolvedValue([
      { id: 9, title: "점검 안내", createdAt: new Date("2026-08-10T09:00:00Z") },
      { id: 8, title: "업데이트 안내", createdAt: new Date("2026-08-09T09:00:00Z") },
    ]);
    const orderBy = vi.fn(() => ({ limit }));
    const where = vi.fn(() => ({ orderBy }));
    const from = vi.fn(() => ({ where }));
    const select = vi.fn((_selection: unknown) => ({ from }));

    const result = await readNoticePreview({ select } as never);

    expect(result).toEqual({
      posts: [
        { id: 9, title: "점검 안내", createdAt: 1_786_352_400_000 },
        { id: 8, title: "업데이트 안내", createdAt: 1_786_266_000_000 },
      ],
    });
    expect(select).toHaveBeenCalledOnce();
    expect(Object.keys(select.mock.calls[0][0] as object)).toEqual([
      "id",
      "title",
      "createdAt",
    ]);
    expect(limit).toHaveBeenCalledWith(3);
  });
});
