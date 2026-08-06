import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { previewEquipmentPowerFromSaves } from "@/lib/server/equipmentPowerPreview";
import type { SavedCharacterV2 } from "@/lib/server/derivePlayerCombatV2";

const POWER_PREVIEW_SAVE_KEYS = [
  "character.v2",
  "equipment.v2",
  "proficiency.v2",
  "skills.v2",
] as const;

// POST /api/v2/me/equipment/power-preview — 저장 변경 없이 후보 장착 후 전투력을 미리 계산한다.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:me:equipment:power-preview",
    userLimit: 120,
    ipLimit: 800,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: { iid?: unknown; candidate?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const candidate =
    typeof body.iid === "string" && body.iid.length > 0
      ? ({ iid: body.iid } as const)
      : body.candidate &&
          typeof body.candidate === "object" &&
          !Array.isArray(body.candidate)
        ? (body.candidate as {
            itemId: unknown;
            roll?: unknown;
            enhance?: unknown;
            craftQuality?: unknown;
            craftedBy?: unknown;
          })
        : null;
  if (!candidate) {
    return Response.json(
      { ok: false, error: "bad_candidate" },
      { status: 400 },
    );
  }

  const rows = await db
    .select({ key: savesKv.key, value: savesKv.value })
    .from(savesKv)
    .where(
      and(
        eq(savesKv.userId, userId),
        inArray(savesKv.key, [...POWER_PREVIEW_SAVE_KEYS]),
      ),
    );
  const saves = new Map(rows.map((row) => [row.key, row.value]));
  const preview = previewEquipmentPowerFromSaves({
    character: saves.get("character.v2") as SavedCharacterV2 | undefined,
    equipmentSave: saves.get("equipment.v2"),
    proficiencyRaw: saves.get("proficiency.v2"),
    skillsRaw: saves.get("skills.v2"),
    candidate,
  });
  if (!preview.ok) {
    return Response.json(preview, {
      status: preview.error === "no_character" ? 404 : 400,
    });
  }
  return Response.json(preview);
}
