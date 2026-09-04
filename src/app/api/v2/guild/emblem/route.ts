import { and, eq, isNull } from "drizzle-orm";
import {
  GUILD_CUSTOM_EMBLEM_COIN_COST,
  GUILD_EMBLEM_IMAGE_MAX_BYTES,
  guildGameImageValue,
  isGuildEmblemObjectKey,
} from "@/adventure/data/guild-emblems";
import { isValidAvatarId } from "@/adventure/profile/avatars";
import { db } from "@/db";
import { guildMembers, guilds } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { processGuildEmblemImage } from "@/lib/server/guildEmblemImage";
import {
  deleteGuildEmblemImage,
  isGuildEmblemStorageConfigured,
  uploadGuildEmblemImage,
} from "@/lib/server/guildEmblemStorage";
import { logGuildActivity } from "@/lib/server/guildActivityLog";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { spendMuseunCoins } from "@/lib/server/museunCoinAccount";
import { requireCurrentUgcConsent } from "@/lib/server/ugcSafety";

const MAX_MULTIPART_BYTES = GUILD_EMBLEM_IMAGE_MAX_BYTES + 256 * 1024;

type AccessResult =
  | { ok: true; guildId: number }
  | { ok: false; status: number; error: string };

async function requireGuildMaster(userId: string): Promise<AccessResult> {
  const [member] = await db
    .select({ guildId: guildMembers.guildId })
    .from(guildMembers)
    .where(eq(guildMembers.userId, userId))
    .limit(1);
  if (!member) return { ok: false, status: 403, error: "no_guild" };

  const [guild] = await db
    .select({ masterId: guilds.masterId })
    .from(guilds)
    .where(and(eq(guilds.id, member.guildId), isNull(guilds.disbandedAt)))
    .limit(1);
  if (!guild) return { ok: false, status: 404, error: "guild_not_found" };
  if (guild.masterId !== userId) {
    return { ok: false, status: 403, error: "not_master" };
  }
  return { ok: true, guildId: member.guildId };
}

async function removeStoredEmblem(key: unknown): Promise<void> {
  if (!isGuildEmblemObjectKey(key)) return;
  if (!isGuildEmblemStorageConfigured()) return;
  try {
    await deleteGuildEmblemImage(key);
  } catch (error) {
    console.error("guild emblem R2 delete failed", error);
  }
}

// POST /api/v2/guild/emblem — 로컬 이미지를 등록·교체(마스터 전용).
// multipart/form-data: image(JPG/PNG/WebP, 2MB 이하). 서버가 256x256 WebP 로 변환해 R2 에 저장한다.
// 등록·교체마다 길드 마스터 개인 무슨 코인을 사용한다. 게임 내 이미지는 PUT 으로 무료 선택한다.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const consentFailure = await requireCurrentUgcConsent(userId);
  if (consentFailure) return consentFailure;

  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:guild:emblem:upload",
    userLimit: 10,
    ipLimit: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const access = await requireGuildMaster(userId);
  if (!access.ok) {
    return Response.json(
      { ok: false, error: access.error },
      { status: access.status },
    );
  }
  if (!isGuildEmblemStorageConfigured()) {
    return Response.json(
      { ok: false, error: "storage_unavailable" },
      { status: 503 },
    );
  }

  const contentLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BYTES) {
    return Response.json(
      { ok: false, error: "image_too_large" },
      { status: 413 },
    );
  }
  if (!req.headers.get("content-type")?.startsWith("multipart/form-data")) {
    return Response.json(
      { ok: false, error: "invalid_file" },
      { status: 400 },
    );
  }

  let image: FormDataEntryValue | null;
  try {
    image = (await req.formData()).get("image");
  } catch {
    return Response.json(
      { ok: false, error: "invalid_file" },
      { status: 400 },
    );
  }
  const processed = await processGuildEmblemImage(image);
  if (!processed.ok) {
    return Response.json(
      { ok: false, error: processed.error },
      { status: processed.error === "image_too_large" ? 413 : 400 },
    );
  }

  let emblem: string;
  try {
    emblem = await uploadGuildEmblemImage({
      guildId: access.guildId,
      bytes: processed.bytes,
    });
  } catch (error) {
    console.error("guild emblem R2 upload failed", error);
    return Response.json(
      { ok: false, error: "storage_error" },
      { status: 502 },
    );
  }

  let result;
  try {
    result = await db.transaction(async (tx) => {
      const [member] = await tx
        .select({ guildId: guildMembers.guildId })
        .from(guildMembers)
        .where(eq(guildMembers.userId, userId))
        .limit(1);
      if (!member || member.guildId !== access.guildId) {
        return { status: 403, body: { ok: false as const, error: "no_guild" } };
      }

      const [guild] = await tx
        .select({ masterId: guilds.masterId, emblem: guilds.emblem })
        .from(guilds)
        .where(and(eq(guilds.id, member.guildId), isNull(guilds.disbandedAt)))
        .for("update")
        .limit(1);
      if (!guild) {
        return {
          status: 404,
          body: { ok: false as const, error: "guild_not_found" },
        };
      }
      if (guild.masterId !== userId) {
        return { status: 403, body: { ok: false as const, error: "not_master" } };
      }

      // 공통 잠금 순서: 길드 행 다음 개인 코인 계정. 모든 소비 경로가 계정 행으로 직렬화된다.
      const spend = await spendMuseunCoins(tx, {
        userId,
        coins: GUILD_CUSTOM_EMBLEM_COIN_COST,
        eventKey: `guild-emblem:${emblem}`,
        kind: "guild_emblem",
        sourceId: emblem,
        detail: { guildId: member.guildId },
      });
      if (!spend.ok) {
        return {
          status: 409,
          body: {
            ok: false as const,
            error: "insufficient_coins",
            cost: GUILD_CUSTOM_EMBLEM_COIN_COST,
            coins: spend.coins,
          },
        };
      }
      const nextCoins = spend.coins;
      await tx.update(guilds).set({ emblem }).where(eq(guilds.id, member.guildId));
      await logGuildActivity(tx, {
        guildId: member.guildId,
        type: "emblem_change",
        actorUserId: userId,
        meta: { amount: GUILD_CUSTOM_EMBLEM_COIN_COST },
      });

      return {
        status: 200,
        body: {
          ok: true as const,
          emblem,
          cost: GUILD_CUSTOM_EMBLEM_COIN_COST,
          coins: nextCoins,
        },
        previousEmblem: guild.emblem,
      };
    });
  } catch (error) {
    await removeStoredEmblem(emblem);
    throw error;
  }

  if (!result.body.ok) {
    await removeStoredEmblem(emblem);
  } else {
    await removeStoredEmblem(result.previousEmblem);
  }
  return Response.json(result.body, { status: result.status });
}

// PUT /api/v2/guild/emblem — 게임에 이미 포함된 캐릭터/NPC/몬스터 이미지를 무료로 선택한다.
export async function PUT(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:guild:emblem:game-image",
    userLimit: 20,
    ipLimit: 120,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: { avatar?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!isValidAvatarId(body.avatar)) {
    return Response.json({ ok: false, error: "invalid_image" }, { status: 400 });
  }
  const emblem = guildGameImageValue(body.avatar);

  const result = await db.transaction(async (tx) => {
    const [member] = await tx
      .select({ guildId: guildMembers.guildId })
      .from(guildMembers)
      .where(eq(guildMembers.userId, userId))
      .limit(1);
    if (!member) {
      return { status: 403, body: { ok: false as const, error: "no_guild" } };
    }

    const [guild] = await tx
      .select({ masterId: guilds.masterId, emblem: guilds.emblem })
      .from(guilds)
      .where(and(eq(guilds.id, member.guildId), isNull(guilds.disbandedAt)))
      .for("update")
      .limit(1);
    if (!guild) {
      return {
        status: 404,
        body: { ok: false as const, error: "guild_not_found" },
      };
    }
    if (guild.masterId !== userId) {
      return { status: 403, body: { ok: false as const, error: "not_master" } };
    }
    if (guild.emblem === emblem) {
      return {
        status: 200,
        body: { ok: true as const, emblem, cost: 0, unchanged: true as const },
        previousEmblem: guild.emblem,
      };
    }

    await tx.update(guilds).set({ emblem }).where(eq(guilds.id, member.guildId));
    await logGuildActivity(tx, {
      guildId: member.guildId,
      type: "emblem_change",
      actorUserId: userId,
      meta: { amount: 0 },
    });
    return {
      status: 200,
      body: { ok: true as const, emblem, cost: 0 },
      previousEmblem: guild.emblem,
    };
  });

  if (result.body.ok && result.previousEmblem !== result.body.emblem) {
    await removeStoredEmblem(result.previousEmblem);
  }
  return Response.json(result.body, { status: result.status });
}

export async function DELETE(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:guild:emblem:delete",
    userLimit: 10,
    ipLimit: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const result = await db.transaction(async (tx) => {
    const [member] = await tx
      .select({ guildId: guildMembers.guildId })
      .from(guildMembers)
      .where(eq(guildMembers.userId, userId))
      .limit(1);
    if (!member) {
      return { status: 403, body: { ok: false as const, error: "no_guild" } };
    }

    const [guild] = await tx
      .select({ masterId: guilds.masterId, emblem: guilds.emblem })
      .from(guilds)
      .where(and(eq(guilds.id, member.guildId), isNull(guilds.disbandedAt)))
      .for("update")
      .limit(1);
    if (!guild) {
      return {
        status: 404,
        body: { ok: false as const, error: "guild_not_found" },
      };
    }
    if (guild.masterId !== userId) {
      return { status: 403, body: { ok: false as const, error: "not_master" } };
    }
    if (guild.emblem === null) {
      return {
        status: 200,
        body: { ok: true as const, emblem: null, cost: 0, unchanged: true as const },
        previousEmblem: null,
      };
    }

    await tx.update(guilds).set({ emblem: null }).where(eq(guilds.id, member.guildId));
    await logGuildActivity(tx, {
      guildId: member.guildId,
      type: "emblem_change",
      actorUserId: userId,
      meta: { amount: 0 },
    });
    return {
      status: 200,
      body: { ok: true as const, emblem: null, cost: 0 },
      previousEmblem: guild.emblem,
    };
  });

  if (result.body.ok) await removeStoredEmblem(result.previousEmblem);
  return Response.json(result.body, { status: result.status });
}
