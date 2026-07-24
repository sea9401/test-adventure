import "server-only";

import sharp from "sharp";
import {
  PROFILE_IMAGE_MAX_BYTES,
  PROFILE_IMAGE_MAX_DIMENSION,
  PROFILE_IMAGE_MAX_FRAMES,
  PROFILE_IMAGE_MAX_TOTAL_PIXELS,
  PROFILE_IMAGE_SIZE,
} from "@/adventure/profile/avatars";

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);

export type ProfileImageCheckError =
  | "invalid_file"
  | "not_image"
  | "image_too_large"
  | "image_dimensions";

export async function processProfileImage(
  value: unknown,
): Promise<
  | { ok: true; bytes: Uint8Array }
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
      limitInputPixels: PROFILE_IMAGE_MAX_TOTAL_PIXELS,
      sequentialRead: true,
    }).metadata();
    const pages = metadata.pages ?? 1;
    const frameHeight = metadata.pageHeight ?? metadata.height;
    if (
      !metadata.format ||
      !ALLOWED_FORMATS.has(metadata.format) ||
      !metadata.width ||
      !frameHeight
    ) {
      return { ok: false, error: "not_image" };
    }
    if (
      metadata.width > PROFILE_IMAGE_MAX_DIMENSION ||
      frameHeight > PROFILE_IMAGE_MAX_DIMENSION ||
      pages > PROFILE_IMAGE_MAX_FRAMES
    ) {
      return { ok: false, error: "image_dimensions" };
    }

    const bytes = await sharp(input, {
      animated: true,
      failOn: "error",
      limitInputPixels: PROFILE_IMAGE_MAX_TOTAL_PIXELS,
      sequentialRead: true,
    })
      .rotate()
      .resize(PROFILE_IMAGE_SIZE, PROFILE_IMAGE_SIZE, {
        fit: "cover",
        position: "centre",
      })
      .webp({ quality: 82, effort: 4 })
      .toBuffer();

    return { ok: true, bytes };
  } catch {
    return { ok: false, error: "not_image" };
  }
}
