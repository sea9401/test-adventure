import { db } from "@/db";
import { requireAdmin } from "@/lib/server/isAdmin";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { MAX_LEVEL } from "@/lib/leveling";
import { parseV2Class, tier1ClassOf } from "@/adventure/data/v2/classes";
import {
  parseProficiencyForChar,
  emptyProficiency,
  addPoints,
  groupUsable,
  type V2ProficiencyState,
} from "@/adventure/data/v2/proficiency";
import {
  V2_MATERIALS,
  mergeDrops,
  type DropResult,
  type V2MaterialId,
} from "@/adventure/data/v2/dungeonDrops";
import {
  V2_EQUIPMENT,
  parseEquipmentSave,
  genEquipIid,
  type EquipmentSave,
  type V2EquipInstance,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";
import { initialStamina } from "@/adventure/v2/stamina";

// POST /api/admin/v2-grant — 관리자가 선택한 유저에게 v2 자원 지급.
//
// /api/v2/dev/grant(+grant-equipment) 의 admin 판: 본인이 아닌 **대상 userId** 에,
// IS_STAGING 무관(requireAdmin 게이트, ADMIN_EMAILS). 골드·EXP·레벨은 유저탭 캐릭터
// 패널에서 character.v2 PATCH 로 직접 편집하므로 여기선 제외 — synced-keys 화이트리스트
// 밖이라 일반 saves PATCH 로 안 되는 v2 키(equipment.v2/proficiency.v2)와
// character.v2.materials / inventory.v2 충전약을 한 트랜잭션으로 처리한다.
//
// 본문(전부 선택): { userId, materials?: {[V2MaterialId]: number},
//   hpCharges?, mpCharges?, proficiency?, equipmentId? }

const MAX_GRANT = 1_000_000_000;

function clampInt(n: unknown, min: number, max: number): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

type CharSave = {
  level?: number;
  class?: unknown;
  materials?: unknown;
  [k: string]: unknown;
};

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (gate) return gate;

  let body: {
    userId?: unknown;
    materials?: unknown;
    hpCharges?: unknown;
    mpCharges?: unknown;
    proficiency?: unknown;
    equipmentId?: unknown;
    refillStamina?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!userId) {
    return Response.json({ ok: false, error: "missing_userId" }, { status: 400 });
  }

  const hpChargeGain = clampInt(body.hpCharges, 0, MAX_GRANT);
  const mpChargeGain = clampInt(body.mpCharges, 0, MAX_GRANT);
  const proficiencyGain = clampInt(body.proficiency, 0, MAX_GRANT);

  // 재료 — 유효 V2MaterialId + 양수만.
  const matGrant: DropResult = {};
  if (body.materials && typeof body.materials === "object") {
    for (const [k, v] of Object.entries(
      body.materials as Record<string, unknown>,
    )) {
      if (!(k in V2_MATERIALS)) continue;
      const amount = clampInt(v, 0, MAX_GRANT);
      if (amount > 0) matGrant[k as V2MaterialId] = amount;
    }
  }

  const equipmentId =
    typeof body.equipmentId === "string" && body.equipmentId in V2_EQUIPMENT
      ? (body.equipmentId as V2EquipmentId)
      : null;

  const refillStamina = body.refillStamina === true;

  const hasMaterials = Object.keys(matGrant).length > 0;
  const hasCharges = hpChargeGain > 0 || mpChargeGain > 0;
  if (
    !hasMaterials &&
    !hasCharges &&
    proficiencyGain <= 0 &&
    !equipmentId &&
    !refillStamina
  ) {
    return Response.json({ ok: false, error: "nothing_to_grant" }, { status: 400 });
  }

  const result = await db.transaction(async (tx) => {
    const out: {
      ok: true;
      materials?: DropResult;
      hpCharges?: number;
      mpCharges?: number;
      proficiencyEarned?: number | null;
      equipmentOwned?: V2EquipInstance[];
      equipmentNoOp?: true;
      staminaRefilled?: number;
    } = { ok: true };

    // character.v2 — 재료(병합)·스태미나 회복(쓰기) + 숙련도 컨텍스트(class/level, 읽기)에
    //   모두 필요. 한 번만 lock 하고 변경분을 모아 한 번만 upsert(materials↔stamina 덮어쓰기 방지).
    let charSave: CharSave | null = null;
    if (hasMaterials || proficiencyGain > 0 || refillStamina) {
      charSave = await lockSaveForUpdate<CharSave>(tx, userId, "character.v2", {});
      let nextChar: CharSave = charSave;
      let charChanged = false;
      if (hasMaterials) {
        const materials = mergeDrops(charSave.materials, matGrant);
        nextChar = { ...nextChar, materials };
        out.materials = materials;
        charChanged = true;
      }
      if (refillStamina) {
        const stamina = initialStamina(Date.now());
        nextChar = { ...nextChar, stamina };
        out.staminaRefilled = stamina.current;
        charChanged = true;
      }
      if (charChanged) {
        await upsertSave(tx, userId, "character.v2", nextChar);
      }
    }

    // 락 순서는 dev grant(/api/v2/dev/grant: character.v2 → proficiency.v2 → inventory.v2)와
    // 동일하게 유지 — 같은 유저에 두 경로가 동시 실행돼도 데드락 안 나게.

    // 숙련도 — 현 직업군(tier1) points += 값. 직업 없으면 미지급(null 신호).
    if (proficiencyGain > 0 && charSave) {
      const group = tier1ClassOf(parseV2Class(charSave.class));
      if (group === "none") {
        out.proficiencyEarned = null;
      } else {
        const level = Math.max(1, Math.min(MAX_LEVEL, charSave.level ?? 1));
        const profSave = await lockSaveForUpdate<V2ProficiencyState>(
          tx,
          userId,
          "proficiency.v2",
          emptyProficiency(),
        );
        const nextProf = addPoints(
          parseProficiencyForChar(profSave, { class: charSave.class, level }),
          group,
          proficiencyGain,
        );
        await upsertSave(tx, userId, "proficiency.v2", nextProf);
        out.proficiencyEarned = groupUsable(nextProf, group);
      }
    }

    // 충전약 — inventory.v2.
    if (hasCharges) {
      const inv = await lockSaveForUpdate<{
        hpCharges?: number;
        mpCharges?: number;
        [k: string]: unknown;
      }>(tx, userId, "inventory.v2", {});
      const hpCharges = Math.max(0, inv.hpCharges ?? 0) + hpChargeGain;
      const mpCharges = Math.max(0, inv.mpCharges ?? 0) + mpChargeGain;
      await upsertSave(tx, userId, "inventory.v2", { ...inv, hpCharges, mpCharges });
      out.hpCharges = hpCharges;
      out.mpCharges = mpCharges;
    }

    // 장비 — equipment.v2.owned 에 추가(이미 보유면 no-op).
    if (equipmentId) {
      const eq = await lockSaveForUpdate<EquipmentSave>(
        tx,
        userId,
        "equipment.v2",
        {},
      );
      const { owned, equipped } = parseEquipmentSave(eq);
      if (owned.some((i) => i.id === equipmentId)) {
        out.equipmentNoOp = true;
      } else {
        // 지급은 굴림 없음(기본값 고정) — roll 없는 개체.
        const nextOwned = [...owned, { iid: genEquipIid(), id: equipmentId }];
        await upsertSave(tx, userId, "equipment.v2", {
          owned: nextOwned,
          equipped,
        });
        out.equipmentOwned = nextOwned;
      }
    }

    return out;
  });

  return Response.json(result);
}
