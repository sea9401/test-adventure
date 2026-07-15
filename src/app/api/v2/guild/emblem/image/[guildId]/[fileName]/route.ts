import {
  GUILD_EMBLEM_STORAGE_PREFIX,
  normalizeGuildEmblemObjectKey,
} from "@/adventure/data/guild-emblems";
import {
  isGuildEmblemStorageConfigured,
  readGuildEmblemImage,
} from "@/lib/server/guildEmblemStorage";

export async function GET(
  _req: Request,
  context: { params: Promise<{ guildId: string; fileName: string }> },
) {
  const { guildId, fileName } = await context.params;
  const key = normalizeGuildEmblemObjectKey(
    `${GUILD_EMBLEM_STORAGE_PREFIX}/${guildId}/${fileName}`,
  );
  if (!key) return new Response(null, { status: 404 });
  if (!isGuildEmblemStorageConfigured()) {
    return new Response(null, { status: 503 });
  }

  try {
    const bytes = await readGuildEmblemImage(key);
    if (!bytes) return new Response(null, { status: 404 });
    return new Response(Buffer.from(bytes), {
      headers: {
        "cache-control": "public, max-age=31536000, immutable",
        "content-type": "image/webp",
        "content-length": String(bytes.byteLength),
        "cross-origin-resource-policy": "same-origin",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    console.error("guild emblem R2 read failed", error);
    return new Response(null, { status: 502 });
  }
}
