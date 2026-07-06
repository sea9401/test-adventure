import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
} from "@/lib/server/savesKv";
import { CHARACTER_STATE_KEY, ARENA_LOADOUTS_KEY } from "@/lib/storage-keys";
import {
  ARENA_LOADOUT_NAME_MAX,
  ARENA_LOADOUT_TEMPLATE_ID,
  parseActiveArenaLoadout,
  serializeActiveArenaLoadout,
  type ArenaLoadout,
} from "@/adventure/data/v2/arenaLoadout";
import {
  parseEquipmentSave,
  V2_EQUIPMENT,
  type EquipmentSave,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import {
  emptyV2SkillsState,
  parseV2SkillsState,
  V2_SKILLS,
} from "@/adventure/data/v2/v2Skills";
import {
  parseV2Element,
  V2_ELEMENT_LABEL,
} from "@/adventure/data/v2/elements";

const SLOT_LABEL: Record<V2EquipSlot, string> = {
  weapon: "무기",
  armor: "방어구",
  gloves: "장갑",
  boots: "신발",
  ring: "장신구",
  necklace: "목걸이",
};

type PresentedArenaLoadout = ArenaLoadout & {
  summary: {
    elementLabel: string | null;
    skills: { id: string; name: string; passive: boolean }[];
    equipment: { slot: V2EquipSlot; slotLabel: string; iid: string; name: string }[];
    patternBlocks: number;
  };
};

function presentLoadout(
  loadout: ArenaLoadout | null,
  equipmentRaw: unknown,
): PresentedArenaLoadout | null {
  if (!loadout) return null;
  const { owned } = parseEquipmentSave(equipmentRaw);
  const ownedByIid = new Map(owned.map((item) => [item.iid, item]));
  const equipment: PresentedArenaLoadout["summary"]["equipment"] = [];
  for (const slot of Object.keys(loadout.equipment) as V2EquipSlot[]) {
    const iid = loadout.equipment[slot];
    if (!iid) continue;
    const inst = ownedByIid.get(iid);
    equipment.push({
      slot,
      slotLabel: SLOT_LABEL[slot],
      iid,
      name: inst ? (V2_EQUIPMENT[inst.id]?.name ?? inst.id) : "보유하지 않은 장비",
    });
  }
  return {
    ...loadout,
    summary: {
      elementLabel: loadout.element ? V2_ELEMENT_LABEL[loadout.element] : null,
      skills: loadout.skills.map((id) => ({
        id,
        name: V2_SKILLS[id]?.name ?? id,
        passive: Boolean(V2_SKILLS[id]?.passive),
      })),
      equipment,
      patternBlocks: loadout.pattern?.blocks.length ?? 0,
    },
  };
}

// 아레나 설정 — 활성 템플릿 1개.
// GET  → 현재 저장된 아레나 템플릿.
// POST { action: "save", name? } → 현재 속성·장착 스킬·전투 패턴·장비를 아레나 템플릿으로 저장.
//      { action: "delete" } → 저장된 템플릿 삭제.
//
// 저장된 템플릿은 캐릭터의 현재 장착을 바꾸지 않는다. /arena/match 가 공격/수비 양쪽 전투 입력에
// 오버레이해서 사용한다.

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const [loadoutRow, equipmentRow] = await Promise.all([
    db
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(and(eq(savesKv.userId, userId), eq(savesKv.key, ARENA_LOADOUTS_KEY)))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(and(eq(savesKv.userId, userId), eq(savesKv.key, "equipment.v2")))
      .limit(1)
      .then((rows) => rows[0]),
  ]);
  const loadout = parseActiveArenaLoadout(loadoutRow?.value ?? null);
  return Response.json({
    ok: true,
    loadout: presentLoadout(loadout, equipmentRow?.value ?? null),
    loadouts: loadout ? [loadout] : [],
  });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let body: { action?: unknown; name?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const result = await db.transaction(async (tx) => {
    await lockSaveForUpdate<unknown>(tx, userId, ARENA_LOADOUTS_KEY, []);

    if (body.action === "save") {
      const name =
        typeof body.name === "string" && body.name.trim().length > 0
          ? body.name.trim().slice(0, ARENA_LOADOUT_NAME_MAX)
          : "아레나 템플릿";
      const charSave = await readSave<{ element?: unknown }>(
        tx,
        userId,
        CHARACTER_STATE_KEY,
        {},
      );
      const skills = parseV2SkillsState(
        await readSave(tx, userId, "skills.v2", emptyV2SkillsState()),
      );
      const equipmentRaw = await readSave<EquipmentSave>(
        tx,
        userId,
        "equipment.v2",
        {},
      );
      const { equipped } = parseEquipmentSave(equipmentRaw);
      const loadout: ArenaLoadout = {
        id: ARENA_LOADOUT_TEMPLATE_ID,
        name,
        savedAt: new Date().toISOString(),
        element: parseV2Element(charSave.element),
        skills: skills.equipped,
        pattern: skills.pattern ?? null,
        equipment: equipped,
      };
      await upsertSave(
        tx,
        userId,
        ARENA_LOADOUTS_KEY,
        serializeActiveArenaLoadout(loadout),
      );
      return {
        status: 200,
        body: {
          ok: true as const,
          loadout: presentLoadout(loadout, equipmentRaw),
          loadouts: [loadout],
        },
      };
    }

    if (body.action === "delete") {
      await upsertSave(tx, userId, ARENA_LOADOUTS_KEY, []);
      return {
        status: 200,
        body: { ok: true as const, loadout: null, loadouts: [] },
      };
    }

    return {
      status: 400,
      body: { ok: false as const, error: "bad_action" as const },
    };
  });

  return Response.json(result.body, { status: result.status });
}
