import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  FEEDBACK_IMAGE_MAX_BYTES,
  FEEDBACK_IMAGE_OUTPUT_MAX_DIMENSION,
  normalizeFeedbackImageObjectKey,
} from "@/lib/feedbackImage";
import { processFeedbackImage } from "./feedbackImage";

const IMAGE_KEY =
  "feedback-images/123e4567-e89b-42d3-a456-426614174000.webp";

describe("건의 첨부 이미지 R2 객체 키", () => {
  it("서버가 생성하는 feedback-images WebP 키만 허용한다", () => {
    expect(normalizeFeedbackImageObjectKey(` ${IMAGE_KEY} `)).toBe(IMAGE_KEY);
    expect(
      normalizeFeedbackImageObjectKey("https://example.com/private.png"),
    ).toBeNull();
    expect(
      normalizeFeedbackImageObjectKey(
        "feedback-images/123e4567-e89b-12d3-a456-426614174000.webp",
      ),
    ).toBeNull();
  });
});

describe("건의 첨부 이미지 처리", () => {
  it("큰 이미지를 비율을 유지한 1600px 이하 WebP로 정규화한다", async () => {
    const png = await sharp({
      create: {
        width: 2400,
        height: 1200,
        channels: 4,
        background: { r: 20, g: 120, b: 200, alpha: 0.8 },
      },
    })
      .png()
      .toBuffer();
    const result = await processFeedbackImage(
      new File([Uint8Array.from(png)], "feedback.png", { type: "image/png" }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const metadata = await sharp(result.bytes).metadata();
    expect(metadata).toMatchObject({
      format: "webp",
      width: FEEDBACK_IMAGE_OUTPUT_MAX_DIMENSION,
      height: 800,
    });
  });

  it("빈 파일, MIME 위장, 5MB 초과 파일을 거부한다", async () => {
    await expect(
      processFeedbackImage(new File([], "empty.png", { type: "image/png" })),
    ).resolves.toEqual({ ok: false, error: "invalid_file" });
    await expect(
      processFeedbackImage(
        new File(["not an image"], "fake.png", { type: "image/png" }),
      ),
    ).resolves.toEqual({ ok: false, error: "not_image" });
    await expect(
      processFeedbackImage(
        new File(
          [new Uint8Array(FEEDBACK_IMAGE_MAX_BYTES + 1)],
          "large.png",
          { type: "image/png" },
        ),
      ),
    ).resolves.toEqual({ ok: false, error: "image_too_large" });
  });
});
