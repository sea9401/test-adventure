import { db } from "@/db";
import { isValidAvatarId, isProfileImageObjectKey } from "@/adventure/profile/avatars";
import { readProfileValue } from "@/adventure/profile/profileValue";
import {
  parseMuseunCashItems,
  removeMuseunCashItem,
} from "@/adventure/data/v2/museunCashItems";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import { PROFILE_STORAGE_KEY } from "@/lib/storage-keys";
import {
  deleteProfileImage,
  isProfileImageStorageConfigured,
} from "@/lib/server/profileImageStorage";

const PERMIT_ID = "profile_image_permit" as const;

async function removeStoredProfileImage(value: unknown): Promise<void> {
  if (!isProfileImageObjectKey(value) || !isProfileImageStorageConfigured()) return;
  try {
    await deleteProfileImage(value);
  } catch (error) {
    console.error("profile image R2 delete failed", error);
  }
}

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const [rawProfile, character] = await Promise.all([
    readSave(db, userId, PROFILE_STORAGE_KEY, {}),
    readSave<Record<string, unknown>>(db, userId, "character.v2", {}),
  ]);
  const profile = readProfileValue(rawProfile);
  if (!profile) {
    return Response.json({ ok: false, error: "profile_not_found" }, { status: 404 });
  }
  const cashItems = parseMuseunCashItems(character.cashItems);
  return Response.json({
    ok: true,
    avatar: profile.gender,
    permits: cashItems[PERMIT_ID] ?? 0,
  });
}

// 게임 내 이미지를 프로필로 선택한다. 성공한 변경에만 변경권 1개를 소모한다.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "profile:avatar:change",
    userLimit: 20,
    ipLimit: 120,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: { avatar?: unknown; gender?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const avatar = body.avatar ?? body.gender;
  if (!isValidAvatarId(avatar)) {
    return Response.json({ ok: false, error: "invalid_avatar" }, { status: 400 });
  }

  const result = await db.transaction(async (tx) => {
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
    if (profile.gender === avatar) {
      return { status: 409, body: { ok: false as const, error: "unchanged" } };
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
        permits: cashItems[PERMIT_ID] ?? 0,
      },
      previousAvatar: profile.gender,
    };
  });

  if (result.body.ok) await removeStoredProfileImage(result.previousAvatar);
  return Response.json(result.body, { status: result.status });
}
