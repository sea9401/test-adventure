import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GUILD_EMBLEM_IMAGE_MAX_BYTES,
  normalizeGuildEmblemImageUrl,
} from "@/adventure/data/guild-emblems";
import { verifyGuildEmblemImage } from "./guildEmblemImage";

describe("길드 엠블럼 이미지 URL", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("i.imgur.com 직접 이미지 주소만 정규화한다", () => {
    expect(normalizeGuildEmblemImageUrl(" https://i.imgur.com/bC2okTl.jpg ")).toBe(
      "https://i.imgur.com/bC2okTl.jpg",
    );
    expect(normalizeGuildEmblemImageUrl("https://i.imgur.com/bC2okTl.jpg.png")).toBe(
      "https://i.imgur.com/bC2okTl.jpg.png",
    );
    expect(normalizeGuildEmblemImageUrl("http://i.imgur.com/a.jpg")).toBeNull();
    expect(normalizeGuildEmblemImageUrl("https://imgur.com/a.jpg")).toBeNull();
    expect(normalizeGuildEmblemImageUrl("https://i.imgur.com/a.svg")).toBeNull();
    expect(normalizeGuildEmblemImageUrl("https://i.imgur.com/a.jpg?x=1")).toBeNull();
  });

  it("원격 응답이 허용 이미지이고 2MB 이하면 승인한다", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(null, {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
          "content-length": "1234",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyGuildEmblemImage("https://i.imgur.com/a.jpg")).resolves.toEqual({
      ok: true,
      url: "https://i.imgur.com/a.jpg",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://i.imgur.com/a.jpg",
      expect.objectContaining({ method: "HEAD", redirect: "error" }),
    );
  });

  it("이미지가 아니거나 2MB를 넘으면 거부한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(null, {
            status: 200,
            headers: { "content-type": "text/html", "content-length": "100" },
          }),
        )
        .mockResolvedValueOnce(
          new Response(null, {
            status: 200,
            headers: {
              "content-type": "image/png",
              "content-length": String(GUILD_EMBLEM_IMAGE_MAX_BYTES + 1),
            },
          }),
        ),
    );

    await expect(verifyGuildEmblemImage("https://i.imgur.com/a.jpg")).resolves.toEqual({
      ok: false,
      error: "not_image",
    });
    await expect(verifyGuildEmblemImage("https://i.imgur.com/a.png")).resolves.toEqual({
      ok: false,
      error: "image_too_large",
    });
  });
});
