import "server-only";

import sharp from "sharp";
import {
  GUILD_EMBLEM_IMAGE_MAX_BYTES,
  GUILD_EMBLEM_IMAGE_MAX_DIMENSION,
  GUILD_EMBLEM_IMAGE_SIZE,
} from "@/adventure/data/guild-emblems";

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);

export type GuildEmblemImageCheckError =
  | "invalid_file"
  | "not_image"
  | "image_too_large"
  | "image_dimensions";

export async function processGuildEmblemImage(
  value: unknown,
): Promise<
  | { ok: true; bytes: Uint8Array }
  | { ok: false; error: GuildEmblemImageCheckError }
> {
  if (!(value instanceof File) || value.size <= 0) {
    return { ok: false, error: "invalid_file" };
  }
  if (value.size > GUILD_EMBLEM_IMAGE_MAX_BYTES) {
    return { ok: false, error: "image_too_large" };
  }
  if (!ALLOWED_CONTENT_TYPES.has(value.type.toLowerCase())) {
    return { ok: false, error: "not_image" };
  }

  const input = Buffer.from(await value.arrayBuffer());
  try {
    const probe = sharp(input, {
      failOn: "error",
      limitInputPixels:
        GUILD_EMBLEM_IMAGE_MAX_DIMENSION * GUILD_EMBLEM_IMAGE_MAX_DIMENSION,
      sequentialRead: true,
    });
    const metadata = await probe.metadata();
    if (
      !metadata.format ||
      !ALLOWED_FORMATS.has(metadata.format) ||
      !metadata.width ||
      !metadata.height
    ) {
      return { ok: false, error: "not_image" };
    }
    if (
      metadata.width > GUILD_EMBLEM_IMAGE_MAX_DIMENSION ||
      metadata.height > GUILD_EMBLEM_IMAGE_MAX_DIMENSION ||
      (metadata.pages ?? 1) > 1
    ) {
      return { ok: false, error: "image_dimensions" };
    }

    const bytes = await sharp(input, {
      failOn: "error",
      limitInputPixels:
        GUILD_EMBLEM_IMAGE_MAX_DIMENSION * GUILD_EMBLEM_IMAGE_MAX_DIMENSION,
      sequentialRead: true,
    })
      .rotate()
      .resize(GUILD_EMBLEM_IMAGE_SIZE, GUILD_EMBLEM_IMAGE_SIZE, {
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
