import {
  GUILD_EMBLEM_IMAGE_MAX_BYTES,
  normalizeGuildEmblemImageUrl,
} from "@/adventure/data/guild-emblems";

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type GuildEmblemImageCheckError =
  | "bad_emblem"
  | "image_unreachable"
  | "not_image"
  | "image_too_large";

export async function verifyGuildEmblemImage(
  value: unknown,
): Promise<{ ok: true; url: string } | { ok: false; error: GuildEmblemImageCheckError }> {
  const url = normalizeGuildEmblemImageUrl(value);
  if (!url) return { ok: false, error: "bad_emblem" };

  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return { ok: false, error: "image_unreachable" };

    const contentType = response.headers.get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();
    if (!contentType || !ALLOWED_CONTENT_TYPES.has(contentType)) {
      return { ok: false, error: "not_image" };
    }

    const rawLength = response.headers.get("content-length");
    const contentLength = rawLength == null ? Number.NaN : Number(rawLength);
    if (!Number.isFinite(contentLength) || contentLength <= 0) {
      return { ok: false, error: "image_unreachable" };
    }
    if (contentLength > GUILD_EMBLEM_IMAGE_MAX_BYTES) {
      return { ok: false, error: "image_too_large" };
    }

    return { ok: true, url };
  } catch {
    return { ok: false, error: "image_unreachable" };
  }
}
