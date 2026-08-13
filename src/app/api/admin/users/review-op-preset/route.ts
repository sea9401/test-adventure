import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { logAdminAction } from "@/lib/server/adminAudit";
import {
  currentAdminEmail,
  isSuperAdminEmail,
  requireAdminRole,
} from "@/lib/server/isAdmin";
import { derivePlayerCombatV2FromSaves } from "@/lib/server/derivePlayerCombatV2";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
} from "@/lib/server/savesKv";
import {
  REVIEW_ADMIN_LIFE_SAVE_KEYS,
  buildReviewAdminLifePreset,
  buildReviewAdminOpPreset,
} from "@/lib/server/reviewAdminOpPreset";

function nonNegativeInt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

// POST /api/admin/users/review-op-preset — body { userId }
// 최고 관리자 계정의 기존 캐릭터를 심의용 전투·진행 상태로 상향한다.
// 직업·장비·스킬·퀘스트·스토리와 프리셋보다 높은 값은 보존한다.
export async function POST(req: Request) {
  const gate = await requireAdminRole("super");
  if (gate) return gate;

  let body: { userId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!userId) {
    return Response.json(
      { ok: false, error: "missing_userId" },
      { status: 400 },
    );
  }

  const [target] = await db
    .select({ id: users.id, email: users.email, gameName: users.gameName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!target) {
    return Response.json(
      { ok: false, error: "user_not_found" },
      { status: 404 },
    );
  }
  if (!isSuperAdminEmail(target.email)) {
    return Response.json(
      { ok: false, error: "target_not_super_admin" },
      { status: 400 },
    );
  }

  const result = await db.transaction(async (tx) => {
    // 장비·스킬은 읽기 전용이다. 쓰는 세 키는 기존 관리자 지급 경로와 같은
    // character → proficiency → inventory 순서로 잠가 교착 가능성을 낮춘다.
    const equipmentSave = await readSave<unknown>(
      tx,
      userId,
      "equipment.v2",
      {},
    );
    const skillsRaw = await readSave<unknown>(tx, userId, "skills.v2", {});
    const characterRaw = await lockSaveForUpdate<Record<string, unknown> | null>(
      tx,
      userId,
      "character.v2",
      null,
    );
    if (!characterRaw) {
      return { ok: false as const, error: "character_required" as const };
    }
    const proficiencyRaw = await lockSaveForUpdate<unknown>(
      tx,
      userId,
      "proficiency.v2",
      {},
    );
    const inventoryRaw = await lockSaveForUpdate<Record<string, unknown>>(
      tx,
      userId,
      "inventory.v2",
      {},
    );

    const before = {
      level: nonNegativeInt(characterRaw.level),
      frontierDepth: nonNegativeInt(characterRaw.frontierDepth),
      gold: nonNegativeInt(characterRaw.gold),
      proficiencyPoints:
        proficiencyRaw && typeof proficiencyRaw === "object"
          ? nonNegativeInt(
              (proficiencyRaw as { points?: unknown }).points,
            )
          : 0,
    };
    const nowMs = Date.now();
    const preset = buildReviewAdminOpPreset({
      characterRaw,
      proficiencyRaw,
      inventoryRaw,
      nowMs,
    });
    if (!preset) {
      return { ok: false as const, error: "class_required" as const };
    }

    const combat = derivePlayerCombatV2FromSaves({
      character: {
        ...preset.character,
        hp: nonNegativeInt(preset.character.hp),
        mp: nonNegativeInt(preset.character.mp),
      },
      equipmentSave,
      proficiencyRaw: preset.proficiency,
      skillsRaw,
    });
    if (!combat) {
      return { ok: false as const, error: "combat_unavailable" as const };
    }

    const farmRaw = await lockSaveForUpdate(
      tx,
      userId,
      REVIEW_ADMIN_LIFE_SAVE_KEYS.farm,
      {},
    );
    const woodcuttingRaw = await lockSaveForUpdate(
      tx,
      userId,
      REVIEW_ADMIN_LIFE_SAVE_KEYS.woodcutting,
      {},
    );
    const miningRaw = await lockSaveForUpdate(
      tx,
      userId,
      REVIEW_ADMIN_LIFE_SAVE_KEYS.mining,
      {},
    );
    const fishingRaw = await lockSaveForUpdate(
      tx,
      userId,
      REVIEW_ADMIN_LIFE_SAVE_KEYS.fishing,
      {},
    );
    const cookingRaw = await lockSaveForUpdate(
      tx,
      userId,
      REVIEW_ADMIN_LIFE_SAVE_KEYS.cooking,
      {},
    );
    const life = buildReviewAdminLifePreset({
      farmRaw,
      woodcuttingRaw,
      miningRaw,
      fishingRaw,
      cookingRaw,
      nowMs,
    });

    const character = {
      ...preset.character,
      hp: combat.maxHp,
      mp: combat.player.maxMp,
    };
    await upsertSave(tx, userId, "character.v2", character);
    await upsertSave(tx, userId, "proficiency.v2", preset.proficiency);
    await upsertSave(tx, userId, "inventory.v2", preset.inventory);
    await upsertSave(tx, userId, REVIEW_ADMIN_LIFE_SAVE_KEYS.farm, life.farm);
    await upsertSave(
      tx,
      userId,
      REVIEW_ADMIN_LIFE_SAVE_KEYS.woodcutting,
      life.woodcutting,
    );
    await upsertSave(tx, userId, REVIEW_ADMIN_LIFE_SAVE_KEYS.mining, life.mining);
    await upsertSave(tx, userId, REVIEW_ADMIN_LIFE_SAVE_KEYS.fishing, life.fishing);
    await upsertSave(tx, userId, REVIEW_ADMIN_LIFE_SAVE_KEYS.cooking, life.cooking);

    return {
      ok: true as const,
      before,
      character,
      proficiency: preset.proficiency,
      inventory: preset.inventory,
      life,
    };
  });

  if (!result.ok) {
    return Response.json(
      { ok: false, error: result.error },
      { status: 409 },
    );
  }

  const after = {
    level: result.character.level,
    frontierDepth: result.character.frontierDepth,
    gold: result.character.gold,
    proficiencyPoints: result.proficiency.points,
    lifeLevels: result.life.levels,
  };
  await logAdminAction({
    adminEmail: await currentAdminEmail(),
    action: "review-op-preset.apply",
    targetUserId: userId,
    detail: {
      gameName: target.gameName,
      before: result.before,
      after,
    },
  });

  return Response.json({
    ok: true,
    level: result.character.level,
    frontierDepth: result.character.frontierDepth,
    gold: result.character.gold,
    bankedGold: result.character.bankedGold,
    fame: result.character.fame,
    hp: result.character.hp,
    mp: result.character.mp,
    hpCharges: result.inventory.hpCharges,
    mpCharges: result.inventory.mpCharges,
    lifeLevels: result.life.levels,
  });
}
