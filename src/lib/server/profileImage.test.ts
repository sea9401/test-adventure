import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  PROFILE_IMAGE_MAX_BYTES,
  PROFILE_IMAGE_SIZE,
} from "@/adventure/profile/avatars";
import {
  createProfileImageThumbnail,
  processProfileImage,
} from "./profileImage";

async function animatedWebp(delays: number[]): Promise<Buffer> {
  const width = 16;
  const frameHeight = 16;
  const raw = Buffer.alloc(width * frameHeight * delays.length * 4);
  for (let frame = 0; frame < delays.length; frame += 1) {
    for (let pixel = 0; pixel < width * frameHeight; pixel += 1) {
      const offset = (frame * width * frameHeight + pixel) * 4;
      raw[offset] = frame % 2 === 0 ? 255 : 0;
      raw[offset + 2] = frame % 2 === 0 ? 0 : 255;
      raw[offset + 3] = 255;
    }
  }
  return sharp(raw, {
    raw: {
      width,
      height: frameHeight * delays.length,
      channels: 4,
      pageHeight: frameHeight,
    },
  })
    .webp({ delay: delays, loop: 0 })
    .toBuffer();
}

describe("processProfileImage", () => {
  it("정지 이미지를 256px WebP 원본과 썸네일로 만든다", async () => {
    const input = await sharp({
      create: {
        width: 64,
        height: 48,
        channels: 4,
        background: "#7c3aed",
      },
    })
      .png()
      .toBuffer();
    const file = new File([input], "profile.png", { type: "image/png" });

    const result = await processProfileImage(file);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.animated).toBe(false);
    await expect(sharp(result.bytes).metadata()).resolves.toMatchObject({
      format: "webp",
      width: PROFILE_IMAGE_SIZE,
      height: PROFILE_IMAGE_SIZE,
    });
    await expect(sharp(result.thumbnailBytes).metadata()).resolves.toMatchObject({
      format: "webp",
      width: PROFILE_IMAGE_SIZE,
      height: PROFILE_IMAGE_SIZE,
    });
  });

  it("허용 범위의 애니메이션 WebP는 프레임을 보존하고 정지 썸네일을 만든다", async () => {
    const input = await animatedWebp([100, 100]);
    const file = new File([Uint8Array.from(input)], "profile.webp", {
      type: "image/webp",
    });

    const result = await processProfileImage(file);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.animated).toBe(true);
    await expect(
      sharp(result.bytes, { animated: true }).metadata(),
    ).resolves.toMatchObject({
      format: "webp",
      width: PROFILE_IMAGE_SIZE,
      pages: 2,
      pageHeight: PROFILE_IMAGE_SIZE,
      delay: [100, 100],
    });
    await expect(sharp(result.thumbnailBytes).metadata()).resolves.toMatchObject({
      format: "webp",
      width: PROFILE_IMAGE_SIZE,
      height: PROFILE_IMAGE_SIZE,
    });
  });

  it("기존 애니메이션 원본에서도 첫 프레임 정지 썸네일을 만든다", async () => {
    const input = await animatedWebp([100, 100]);
    const thumbnail = await createProfileImageThumbnail(input);

    await expect(sharp(thumbnail, { animated: true }).metadata()).resolves.toMatchObject({
      format: "webp",
      width: PROFILE_IMAGE_SIZE,
      height: PROFILE_IMAGE_SIZE,
    });
    expect((await sharp(thumbnail, { animated: true }).metadata()).pages).toBeUndefined();
  });

  it("빈 파일과 MIME 위장 파일을 거절한다", async () => {
    await expect(
      processProfileImage(new File([], "empty.webp", { type: "image/webp" })),
    ).resolves.toEqual({ ok: false, error: "invalid_file" });
    await expect(
      processProfileImage(
        new File(["not an image"], "fake.webp", { type: "image/webp" }),
      ),
    ).resolves.toEqual({ ok: false, error: "not_image" });
  });

  it("4초 또는 15fps 제한을 넘는 애니메이션을 거절한다", async () => {
    const tooLong = await animatedWebp([2_100, 2_100]);
    const tooFast = await animatedWebp([50, 50]);

    await expect(
      processProfileImage(
        new File([Uint8Array.from(tooLong)], "long.webp", {
          type: "image/webp",
        }),
      ),
    ).resolves.toEqual({ ok: false, error: "animation_too_long" });
    await expect(
      processProfileImage(
        new File([Uint8Array.from(tooFast)], "fast.webp", {
          type: "image/webp",
        }),
      ),
    ).resolves.toEqual({ ok: false, error: "animation_too_fast" });
  });

  it("1MB를 넘는 업로드를 변환 전에 거절한다", async () => {
    const input = new Uint8Array(PROFILE_IMAGE_MAX_BYTES + 1);
    await expect(
      processProfileImage(
        new File([input], "large.webp", { type: "image/webp" }),
      ),
    ).resolves.toEqual({ ok: false, error: "image_too_large" });
  });
});
