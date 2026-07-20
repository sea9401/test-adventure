import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  GUILD_EMBLEM_IMAGE_MAX_BYTES,
  GUILD_EMBLEM_IMAGE_SIZE,
  guildGameImageValue,
  guildEmblemImageSrc,
  normalizeGuildEmblemObjectKey,
} from "@/adventure/data/guild-emblems";
import { processGuildEmblemImage } from "./guildEmblemImage";

const EMBLEM_KEY =
  "guild-emblems/7/123e4567-e89b-42d3-a456-426614174000.webp";

describe("길드 엠블럼 R2 객체 키", () => {
  it("서버가 생성하는 guild-emblems 키만 허용하고 앱 이미지 경로로 바꾼다", () => {
    expect(normalizeGuildEmblemObjectKey(` ${EMBLEM_KEY} `)).toBe(EMBLEM_KEY);
    expect(guildEmblemImageSrc(EMBLEM_KEY)).toBe(
      "/api/v2/guild/emblem/image/7/123e4567-e89b-42d3-a456-426614174000.webp",
    );
    expect(normalizeGuildEmblemObjectKey("https://i.imgur.com/a.jpg")).toBeNull();
    expect(normalizeGuildEmblemObjectKey("guild-emblems/0/a.webp")).toBeNull();
    expect(
      normalizeGuildEmblemObjectKey(
        "guild-emblems/7/123e4567-e89b-12d3-a456-426614174000.webp",
      ),
    ).toBeNull();
  });

  it("게임 내 아바타를 무료 엠블럼 값과 정적 이미지 경로로 바꾼다", () => {
    const value = guildGameImageValue("monster:슬라임");
    expect(value).toBe("game-avatar:monster:슬라임");
    expect(guildEmblemImageSrc(value)).toMatch(/^\/images\/monster\//);
    expect(guildEmblemImageSrc("game-avatar:unknown")).toBeNull();
  });
});

describe("길드 엠블럼 이미지 처리", () => {
  it("허용된 이미지를 256x256 WebP로 정규화한다", async () => {
    const png = await sharp({
      create: {
        width: 320,
        height: 180,
        channels: 4,
        background: { r: 20, g: 120, b: 200, alpha: 0.8 },
      },
    })
      .png()
      .toBuffer();
    const result = await processGuildEmblemImage(
      new File([Uint8Array.from(png)], "emblem.png", { type: "image/png" }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const metadata = await sharp(result.bytes).metadata();
    expect(metadata).toMatchObject({
      format: "webp",
      width: GUILD_EMBLEM_IMAGE_SIZE,
      height: GUILD_EMBLEM_IMAGE_SIZE,
    });
  });

  it("빈 파일, MIME 위장, 2MB 초과 파일을 거부한다", async () => {
    await expect(
      processGuildEmblemImage(new File([], "empty.png", { type: "image/png" })),
    ).resolves.toEqual({ ok: false, error: "invalid_file" });
    await expect(
      processGuildEmblemImage(
        new File(["not an image"], "fake.png", { type: "image/png" }),
      ),
    ).resolves.toEqual({ ok: false, error: "not_image" });
    await expect(
      processGuildEmblemImage(
        new File([new Uint8Array(GUILD_EMBLEM_IMAGE_MAX_BYTES + 1)], "large.png", {
          type: "image/png",
        }),
      ),
    ).resolves.toEqual({ ok: false, error: "image_too_large" });
  });
});
