import {
  PROFILE_IMAGE_STORAGE_PREFIX,
  normalizeProfileImageAssetKey,
  profileImageOriginalObjectKey,
} from "@/adventure/profile/avatars";
import {
  isProfileImageStorageConfigured,
  readProfileImage,
  uploadProfileImageThumbnail,
} from "@/lib/server/profileImageStorage";
import { createProfileImageThumbnail } from "@/lib/server/profileImage";

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
    // 썸네일 도입 전에 등록된 애니메이션도 목록에서 움직이지 않도록 원본의 첫 프레임으로
    // 정지 썸네일을 만든다. R2에 한 번 보강하되, 보강 저장 실패 시에도 변환 결과는 제공한다.
    if (!bytes && key.endsWith(".thumb.webp")) {
      const originalKey = profileImageOriginalObjectKey(key);
      const originalBytes = originalKey
        ? await readProfileImage(originalKey)
        : null;
      if (originalBytes) {
        bytes = await createProfileImageThumbnail(originalBytes);
        try {
          await uploadProfileImageThumbnail(key, bytes);
        } catch (error) {
          console.error("profile image thumbnail backfill failed", error);
        }
      }
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
