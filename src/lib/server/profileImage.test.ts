import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  PROFILE_IMAGE_MAX_BYTES,
  PROFILE_IMAGE_MAX_FRAMES,
  PROFILE_IMAGE_SIZE,
} from "@/adventure/profile/avatars";
import { processProfileImage } from "./profileImage";

async function animatedWebp(): Promise<Buffer> {
  const red = await sharp({
    create: {
      width: 32,
      height: 24,
      channels: 4,
      background: "red",
    },
  })
    .png()
    .toBuffer();
  const blue = await sharp({
    create: {
      width: 32,
      height: 24,
      channels: 4,
      background: "blue",
    },
  })
    .png()
    .toBuffer();
  return sharp([red, blue], { join: { animated: true } })
    .webp({ delay: [80, 120], loop: 3 })
    .toBuffer();
}

describe("프로필 이미지 처리", () => {
  it("정적 이미지를 256x256 WebP로 정규화한다", async () => {
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
    const result = await processProfileImage(
      new File([Uint8Array.from(png)], "profile.png", { type: "image/png" }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    await expect(sharp(result.bytes).metadata()).resolves.toMatchObject({
      format: "webp",
      width: PROFILE_IMAGE_SIZE,
      height: PROFILE_IMAGE_SIZE,
    });
  });

  it("움직이는 WebP의 프레임과 재생 정보를 유지해 정규화한다", async () => {
    const input = await animatedWebp();
    const result = await processProfileImage(
      new File([Uint8Array.from(input)], "profile.webp", {
        type: "image/webp",
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    await expect(
      sharp(result.bytes, { animated: true }).metadata(),
    ).resolves.toMatchObject({
      format: "webp",
      width: PROFILE_IMAGE_SIZE,
      height: PROFILE_IMAGE_SIZE * 2,
      pageHeight: PROFILE_IMAGE_SIZE,
      pages: 2,
      loop: 3,
      delay: [80, 120],
    });
  });

  it("빈 파일, MIME 위장, 2MB 초과 파일을 거부한다", async () => {
    await expect(
      processProfileImage(new File([], "empty.webp", { type: "image/webp" })),
    ).resolves.toEqual({ ok: false, error: "invalid_file" });
    await expect(
      processProfileImage(
        new File(["not an image"], "fake.webp", { type: "image/webp" }),
      ),
    ).resolves.toEqual({ ok: false, error: "not_image" });
    await expect(
      processProfileImage(
        new File(
          [new Uint8Array(PROFILE_IMAGE_MAX_BYTES + 1)],
          "large.webp",
          { type: "image/webp" },
        ),
      ),
    ).resolves.toEqual({ ok: false, error: "image_too_large" });
  });

  it("애니메이션 프레임 상한을 적용한다", async () => {
    const red = await sharp({
      create: {
        width: 1,
        height: 1,
        channels: 4,
        background: "red",
      },
    })
      .png()
      .toBuffer();
    const blue = await sharp({
      create: {
        width: 1,
        height: 1,
        channels: 4,
        background: "blue",
      },
    })
      .png()
      .toBuffer();
    const input = await sharp(
      Array.from(
        { length: PROFILE_IMAGE_MAX_FRAMES + 1 },
        (_, index) => (index % 2 === 0 ? red : blue),
      ),
      { join: { animated: true } },
    )
      .webp({ delay: 50, loop: 0 })
      .toBuffer();

    await expect(
      processProfileImage(
        new File([Uint8Array.from(input)], "too-many-frames.webp", {
          type: "image/webp",
        }),
      ),
    ).resolves.toEqual({ ok: false, error: "image_dimensions" });
  });
});
