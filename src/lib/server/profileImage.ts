import "server-only";

import sharp from "sharp";
import {
  PROFILE_IMAGE_MAX_BYTES,
  PROFILE_IMAGE_MAX_DIMENSION,
  PROFILE_IMAGE_MAX_DURATION_MS,
  PROFILE_IMAGE_MAX_FPS,
  PROFILE_IMAGE_SIZE,
} from "@/adventure/profile/avatars";

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);
const MAX_DECODED_PIXELS = 32 * 1024 * 1024;

export type ProfileImageCheckError =
  | "invalid_file"
  | "not_image"
  | "image_too_large"
  | "image_dimensions"
  | "animation_webp_only"
  | "animation_too_long"
  | "animation_too_fast";

export async function processProfileImage(
  value: unknown,
): Promise<
  | {
      ok: true;
      bytes: Uint8Array;
      thumbnailBytes: Uint8Array;
      animated: boolean;
    }
  | { ok: false; error: ProfileImageCheckError }
> {
  if (!(value instanceof File) || value.size <= 0) {
    return { ok: false, error: "invalid_file" };
  }
  if (value.size > PROFILE_IMAGE_MAX_BYTES) {
    return { ok: false, error: "image_too_large" };
  }
  if (!ALLOWED_CONTENT_TYPES.has(value.type.toLowerCase())) {
    return { ok: false, error: "not_image" };
  }

  const input = Buffer.from(await value.arrayBuffer());
  try {
    const metadata = await sharp(input, {
      animated: true,
      failOn: "error",
      limitInputPixels: MAX_DECODED_PIXELS,
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

    const pages = Math.max(1, metadata.pages ?? 1);
    const frameHeight = metadata.pageHeight ?? metadata.height;
    if (
      metadata.width > PROFILE_IMAGE_MAX_DIMENSION ||
      frameHeight > PROFILE_IMAGE_MAX_DIMENSION
    ) {
      return { ok: false, error: "image_dimensions" };
    }

    const animated = pages > 1;
    if (animated && metadata.format !== "webp") {
      return { ok: false, error: "animation_webp_only" };
    }
    if (animated) {
      const delays = metadata.delay ?? [];
      if (delays.length !== pages) {
        return { ok: false, error: "not_image" };
      }
      if (
        delays.reduce((sum, delay) => sum + delay, 0) >
        PROFILE_IMAGE_MAX_DURATION_MS
      ) {
        return { ok: false, error: "animation_too_long" };
      }
      const minimumDelay = Math.ceil(1_000 / PROFILE_IMAGE_MAX_FPS);
      if (delays.some((delay) => delay < minimumDelay)) {
        return { ok: false, error: "animation_too_fast" };
      }
    }

    const animationOptions = animated
      ? { delay: metadata.delay, loop: metadata.loop ?? 0 }
      : {};
    const bytes = await sharp(input, {
      animated,
      failOn: "error",
      limitInputPixels: MAX_DECODED_PIXELS,
      sequentialRead: true,
    })
      .rotate()
      .resize(PROFILE_IMAGE_SIZE, PROFILE_IMAGE_SIZE, {
        fit: "cover",
        position: "centre",
      })
      .webp({ quality: 80, effort: 4, ...animationOptions })
      .toBuffer();
    if (bytes.byteLength > PROFILE_IMAGE_MAX_BYTES) {
      return { ok: false, error: "image_too_large" };
    }

    const thumbnailBytes = await sharp(input, {
      page: 0,
      pages: 1,
      failOn: "error",
      limitInputPixels: MAX_DECODED_PIXELS,
      sequentialRead: true,
    })
      .rotate()
      .resize(PROFILE_IMAGE_SIZE, PROFILE_IMAGE_SIZE, {
        fit: "cover",
        position: "centre",
      })
      .webp({ quality: 78, effort: 4 })
      .toBuffer();

    return { ok: true, bytes, thumbnailBytes, animated };
  } catch {
    return { ok: false, error: "not_image" };
  }
}
