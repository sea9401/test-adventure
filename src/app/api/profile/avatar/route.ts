import { db } from "@/db";
import { isValidAvatarId, isProfileImageObjectKey } from "@/adventure/profile/avatars";
import { readProfileValue } from "@/adventure/profile/profileValue";
import { parseMuseunCashItems } from "@/adventure/data/v2/museunCashItems";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import { PROFILE_STORAGE_KEY } from "@/lib/storage-keys";
import {
  deleteProfileImage,
  isProfileImageStorageConfigured,
} from "@/lib/server/profileImageStorage";

const PERMIT_ID = "profile_image_permit" as const;
export const GAME_AVATAR_CHANGE_COOLDOWN_MS = 24 * 60 * 60 * 1_000;
const LAST_GAME_AVATAR_CHANGE_KEY = "lastGameProfileImageChangeAt" as const;

function gameAvatarCooldownUntil(value: unknown, now: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const until = Math.floor(value) + GAME_AVATAR_CHANGE_COOLDOWN_MS;
  // 손상되거나 미래로 밀린 저장값 때문에 영구 잠기지 않도록 정상적인 한 주기만 인정한다.
  return until > now && until <= now + GAME_AVATAR_CHANGE_COOLDOWN_MS
    ? until
    : null;
}

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
    gameAvatarCooldownUntil: gameAvatarCooldownUntil(
      character[LAST_GAME_AVATAR_CHANGE_KEY],
      Date.now(),
    ),
  });
}

// 게임 내 이미지는 변경권 없이 선택할 수 있으며, 성공한 변경 후 24시간 쿨타임을 적용한다.
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
    const now = Date.now();
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
    const cooldownUntil = gameAvatarCooldownUntil(
      character[LAST_GAME_AVATAR_CHANGE_KEY],
      now,
    );
    if (cooldownUntil !== null) {
      return {
        status: 429,
        body: {
          ok: false as const,
          error: "game_avatar_cooldown",
          gameAvatarCooldownUntil: cooldownUntil,
        },
      };
    }
    const cashItems = parseMuseunCashItems(character.cashItems);
    const nextCooldownUntil = now + GAME_AVATAR_CHANGE_COOLDOWN_MS;
    await upsertSave(tx, userId, "character.v2", {
      ...character,
      [LAST_GAME_AVATAR_CHANGE_KEY]: now,
    });
    await upsertSave(tx, userId, PROFILE_STORAGE_KEY, { ...profile, gender: avatar });
    return {
      status: 200,
      body: {
        ok: true as const,
        avatar,
        permits: cashItems[PERMIT_ID] ?? 0,
        gameAvatarCooldownUntil: nextCooldownUntil,
      },
      previousAvatar: profile.gender,
    };
  });

  if (result.body.ok) await removeStoredProfileImage(result.previousAvatar);
  return Response.json(result.body, { status: result.status });
}
