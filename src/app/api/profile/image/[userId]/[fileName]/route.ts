import {
  PROFILE_IMAGE_STORAGE_PREFIX,
  normalizeProfileImageAssetKey,
  profileImageOriginalObjectKey,
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
  const key = normalizeProfileImageAssetKey(
    `${PROFILE_IMAGE_STORAGE_PREFIX}/${userId}/${fileName}`,
  );
  if (!key) return new Response(null, { status: 404 });
  if (!isProfileImageStorageConfigured()) return new Response(null, { status: 503 });

  try {
    let bytes = await readProfileImage(key);
    // 썸네일 도입 전 등록된 이미지는 원본 자체가 정지 WebP다. 파생 썸네일이 없으면 원본을
    // 그대로 제공해 기존 프로필이 깨지지 않게 한다.
    if (!bytes && key.endsWith(".thumb.webp")) {
      const originalKey = profileImageOriginalObjectKey(key);
      if (originalKey) bytes = await readProfileImage(originalKey);
    }
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
