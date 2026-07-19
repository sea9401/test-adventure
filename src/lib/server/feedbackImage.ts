import "server-only";

import sharp from "sharp";
import {
  FEEDBACK_IMAGE_MAX_BYTES,
  FEEDBACK_IMAGE_MAX_DIMENSION,
  FEEDBACK_IMAGE_OUTPUT_MAX_DIMENSION,
} from "@/lib/feedbackImage";

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);

export type FeedbackImageCheckError =
  | "invalid_file"
  | "not_image"
  | "image_too_large"
  | "image_dimensions";

export async function processFeedbackImage(
  value: unknown,
): Promise<
  | { ok: true; bytes: Uint8Array }
  | { ok: false; error: FeedbackImageCheckError }
> {
  if (!(value instanceof File) || value.size <= 0) {
    return { ok: false, error: "invalid_file" };
  }
  if (value.size > FEEDBACK_IMAGE_MAX_BYTES) {
    return { ok: false, error: "image_too_large" };
  }
  if (!ALLOWED_CONTENT_TYPES.has(value.type.toLowerCase())) {
    return { ok: false, error: "not_image" };
  }

  const input = Buffer.from(await value.arrayBuffer());
  try {
    const metadata = await sharp(input, {
      failOn: "error",
      limitInputPixels:
        FEEDBACK_IMAGE_MAX_DIMENSION * FEEDBACK_IMAGE_MAX_DIMENSION,
      sequentialRead: true,
    }).metadata();
    if (
      !metadata.format ||
      !ALLOWED_FORMATS.has(metadata.format) ||
      !metadata.width ||
      !metadata.height
    ) {
      return { ok: false, error: "not_image" };
    }
    if (
      metadata.width > FEEDBACK_IMAGE_MAX_DIMENSION ||
      metadata.height > FEEDBACK_IMAGE_MAX_DIMENSION ||
      (metadata.pages ?? 1) > 1
    ) {
      return { ok: false, error: "image_dimensions" };
    }

    const bytes = await sharp(input, {
      failOn: "error",
      limitInputPixels:
        FEEDBACK_IMAGE_MAX_DIMENSION * FEEDBACK_IMAGE_MAX_DIMENSION,
      sequentialRead: true,
    })
      .rotate()
      .resize({
        width: FEEDBACK_IMAGE_OUTPUT_MAX_DIMENSION,
        height: FEEDBACK_IMAGE_OUTPUT_MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82, effort: 4 })
      .toBuffer();

    return { ok: true, bytes };
  } catch {
    return { ok: false, error: "not_image" };
  }
}
