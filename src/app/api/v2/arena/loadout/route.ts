import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
} from "@/lib/server/savesKv";
import { ARENA_LOADOUTS_KEY } from "@/lib/storage-keys";
import {
  ARENA_LOADOUT_MAX,
  ARENA_LOADOUT_NAME_MAX,
  loadoutEquipmentForApply,
  loadoutSkillsForApply,
  parseArenaLoadouts,
  type ArenaLoadout,
} from "@/adventure/data/v2/arenaLoadout";
import {
  emptyV2SkillsState,
  parseV2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import {
  parseEquipmentSave,
  type EquipmentSave,
} from "@/adventure/data/v2/v2Equipment";

// 아레나 세팅(로드아웃) — 캐릭터 현재 빌드(장착 스킬+전투 패턴+장착 장비) 스냅샷 저장/적용/삭제.
// GET  → 목록.
// POST { action: "save", name } → 현재 빌드를 새 로드아웃으로 저장(저장순 ≤ MAX).
//      { action: "apply", id } → 그 로드아웃으로 현재 장착(skills.v2 equipped/pattern +
//                                 equipment.v2 equipped)을 교체. 미보유 스킬/장비는 건너뜀.
//      { action: "delete", id } → 삭제.
//
// 🔑 락 순서 — apply 는 equipment.v2 → skills.v2 순(hunt 라우트와 동일). 이 라우트는 character.v2
//   를 안 잠그지만, 두 키를 다른 라우트와 같은 상대 순서로 잠그면 사이클이 안 생긴다(hunt 도
//   equipment→skills). arena-loadouts.v2 는 이 라우트만 건드려 경합 없음.

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const row = await db
    .select({ value: savesKv.value })
    .from(savesKv)
    .where(and(eq(savesKv.userId, userId), eq(savesKv.key, ARENA_LOADOUTS_KEY)))
    .limit(1)
    .then((rows) => rows[0]);
  return Response.json({ ok: true, loadouts: parseArenaLoadouts(row?.value ?? null) });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let body: { action?: unknown; name?: unknown; id?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const action = body.action;

  const result = await db.transaction(async (tx) => {
    const loadouts = parseArenaLoadouts(
      await lockSaveForUpdate<unknown>(tx, userId, ARENA_LOADOUTS_KEY, []),
    );

    if (action === "save") {
      const name =
        typeof body.name === "string" && body.name.trim().length > 0
          ? body.name.trim().slice(0, ARENA_LOADOUT_NAME_MAX)
          : "내 세팅";
      // 현재 빌드 스냅샷 — 비잠금 read(사용자 자신의 현재 장착을 그대로 찍음).
      const skills = parseV2SkillsState(
        await readSave(tx, userId, "skills.v2", emptyV2SkillsState()),
      );
      const { equipped } = parseEquipmentSave(
        await readSave<EquipmentSave>(tx, userId, "equipment.v2", {}),
      );
      const now = new Date();
      const loadout: ArenaLoadout = {
        id: `${now.getTime().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
        name,
        savedAt: now.toISOString(),
        skills: skills.equipped,
        pattern: skills.pattern ?? null,
        equipment: equipped,
      };
      const next = [loadout, ...loadouts].slice(0, ARENA_LOADOUT_MAX);
      await upsertSave(tx, userId, ARENA_LOADOUTS_KEY, next);
      return { status: 200, body: { ok: true as const, loadouts: next } };
    }

    if (action === "delete") {
      const id = typeof body.id === "string" ? body.id : "";
      const next = loadouts.filter((l) => l.id !== id);
      await upsertSave(tx, userId, ARENA_LOADOUTS_KEY, next);
      return { status: 200, body: { ok: true as const, loadouts: next } };
    }

    if (action === "apply") {
      const id = typeof body.id === "string" ? body.id : "";
      const loadout = loadouts.find((l) => l.id === id);
      if (!loadout) {
        return {
          status: 404,
          body: { ok: false as const, error: "not_found" as const },
        };
      }
      // 락 순서: equipment.v2 → skills.v2 (hunt 와 동일).
      const equipRaw = await lockSaveForUpdate<EquipmentSave>(
        tx,
        userId,
        "equipment.v2",
        {},
      );
      const { owned, equipped } = parseEquipmentSave(equipRaw);
      const ownedIids = new Set(owned.map((o) => o.iid));
      const nextEquipped = loadoutEquipmentForApply(loadout, ownedIids);
      // 적용된 슬롯 수(피드백). 빈 결과여도 정상(장비 다 팔았을 때) — 미장착 상태로.
      void equipped;
      await upsertSave(tx, userId, "equipment.v2", {
        owned,
        equipped: nextEquipped,
      });

      const skillsRaw = await lockSaveForUpdate(
        tx,
        userId,
        "skills.v2",
        emptyV2SkillsState() as unknown as Record<string, unknown>,
      );
      const skills = parseV2SkillsState(skillsRaw);
      const nextSkills = {
        ...skills,
        equipped: loadoutSkillsForApply(loadout, skills.learned),
        pattern: loadout.pattern ?? undefined,
      };
      await upsertSave(tx, userId, "skills.v2", nextSkills);

      return {
        status: 200,
        body: {
          ok: true as const,
          applied: {
            skills: nextSkills.equipped,
            equipmentSlots: Object.keys(nextEquipped).length,
          },
        },
      };
    }

    return {
      status: 400,
      body: { ok: false as const, error: "bad_action" as const },
    };
  });

  return Response.json(result.body, { status: result.status });
}
