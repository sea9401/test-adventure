import { db } from "@/db";
import {
  isProfileImageObjectKey,
  PROFILE_IMAGE_MAX_BYTES,
} from "@/adventure/profile/avatars";
import { readProfileValue } from "@/adventure/profile/profileValue";
import {
  parseMuseunCashItems,
  removeMuseunCashItem,
} from "@/adventure/data/v2/museunCashItems";
import { ensureUser } from "@/lib/server/ensureUser";
import { processProfileImage } from "@/lib/server/profileImage";
import {
  deleteProfileImage,
  isProfileImageStorageConfigured,
  uploadProfileImage,
} from "@/lib/server/profileImageStorage";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import { PROFILE_STORAGE_KEY } from "@/lib/storage-keys";
import { requireCurrentUgcConsent } from "@/lib/server/ugcSafety";

const PERMIT_ID = "profile_image_permit" as const;
const MAX_MULTIPART_BYTES = PROFILE_IMAGE_MAX_BYTES + 256 * 1024;

async function removeStoredImage(value: unknown): Promise<void> {
  if (!isProfileImageObjectKey(value) || !isProfileImageStorageConfigured()) return;
  try {
    await deleteProfileImage(value);
  } catch (error) {
    console.error("profile image R2 delete failed", error);
  }
}

// 직접 등록한 이미지를 256px WebP 로 정규화해 저장한다. 성공한 변경에만 변경권을 소모한다.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const consentFailure = await requireCurrentUgcConsent(userId);
  if (consentFailure) return consentFailure;
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "profile:image:upload",
    userLimit: 10,
    ipLimit: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;
  if (!isProfileImageStorageConfigured()) {
    return Response.json({ ok: false, error: "storage_unavailable" }, { status: 503 });
  }

  // 큰 파일 파싱과 R2 업로드 전에 변경권 보유 여부를 빠르게 확인한다.
  const characterPreview = await readSave<Record<string, unknown>>(
    db,
    userId,
    "character.v2",
    {},
  );
  if ((parseMuseunCashItems(characterPreview.cashItems)[PERMIT_ID] ?? 0) < 1) {
    return Response.json({ ok: false, error: "permit_not_owned" }, { status: 409 });
  }
  const contentLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BYTES) {
    return Response.json({ ok: false, error: "image_too_large" }, { status: 413 });
  }
  if (!req.headers.get("content-type")?.startsWith("multipart/form-data")) {
    return Response.json({ ok: false, error: "invalid_file" }, { status: 400 });
  }

  let image: FormDataEntryValue | null;
  try {
    image = (await req.formData()).get("image");
  } catch {
    return Response.json({ ok: false, error: "invalid_file" }, { status: 400 });
  }
  const processed = await processProfileImage(image);
  if (!processed.ok) {
    return Response.json(
      { ok: false, error: processed.error },
      { status: processed.error === "image_too_large" ? 413 : 400 },
    );
  }

  let avatar: string;
  try {
    avatar = await uploadProfileImage({
      userId,
      bytes: processed.bytes,
      thumbnailBytes: processed.thumbnailBytes,
    });
  } catch (error) {
    console.error("profile image R2 upload failed", error);
    return Response.json({ ok: false, error: "storage_error" }, { status: 502 });
  }

  let result;
  try {
    result = await db.transaction(async (tx) => {
      const character = await lockSaveForUpdate<Record<string, unknown>>(
        tx,
        userId,
        "character.v2",
        {},
      );
      const rawProfile = await lockSaveForUpdate(
        tx,
        userId,
        PROFILE_STORAGE_KEY,
        {},
      );
      const profile = readProfileValue(rawProfile);
      if (!profile) {
        return { status: 404, body: { ok: false as const, error: "profile_not_found" } };
      }
      const cashItems = removeMuseunCashItem(character.cashItems, PERMIT_ID, 1);
      if (!cashItems) {
        return { status: 409, body: { ok: false as const, error: "permit_not_owned" } };
      }
      await upsertSave(tx, userId, "character.v2", { ...character, cashItems });
      await upsertSave(tx, userId, PROFILE_STORAGE_KEY, { ...profile, gender: avatar });
      return {
        status: 200,
        body: {
          ok: true as const,
          avatar,
          animated: processed.animated,
          permits: cashItems[PERMIT_ID] ?? 0,
        },
        previousAvatar: profile.gender,
      };
    });
  } catch (error) {
    await removeStoredImage(avatar);
    throw error;
  }

  if (!result.body.ok) await removeStoredImage(avatar);
  else await removeStoredImage(result.previousAvatar);
  return Response.json(result.body, { status: result.status });
}
