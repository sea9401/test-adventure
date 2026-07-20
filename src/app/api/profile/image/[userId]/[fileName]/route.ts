import {
  PROFILE_IMAGE_STORAGE_PREFIX,
  normalizeProfileImageObjectKey,
} from "@/adventure/profile/avatars";
import {
  isProfileImageStorageConfigured,
  readProfileImage,
} from "@/lib/server/profileImageStorage";

export async function GET(
  _req: Request,
  context: { params: Promise<{ userId: string; fileName: string }> },
) {
  const { userId, fileName } = await context.params;
  const key = normalizeProfileImageObjectKey(
    `${PROFILE_IMAGE_STORAGE_PREFIX}/${userId}/${fileName}`,
  );
  if (!key) return new Response(null, { status: 404 });
  if (!isProfileImageStorageConfigured()) return new Response(null, { status: 503 });

  try {
    const bytes = await readProfileImage(key);
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
    console.error("profile image R2 read failed", error);
    return new Response(null, { status: 502 });
  }
}
