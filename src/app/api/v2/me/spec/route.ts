import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { parseV2Class, tier1ClassOf } from "@/adventure/data/v2/classes";
import { V2_JOB_SPECS } from "@/adventure/data/v2/v2JobSpecs";
import {
  starterWeaponForType,
  genEquipIid,
  parseEquipmentSave,
} from "@/adventure/data/v2/v2Equipment";
import {
  parseProficiencyForChar,
  emptyProficiency,
  type V2ProficiencyState,
} from "@/adventure/data/v2/proficiency";

// POST /api/v2/me/spec — 계파(스펙) 선택 + 차수별 패시브 픽.
//   body { specId }    → 계파 선택(2차 도달부터, job 의 계파 중 하나). 이미 다른 계파면 잠김
//                        (신전 초기화로만 변경). 같은 계파 재선택은 멱등.
//   body { passiveId } → 그 계파 키트에서 패시브 1개 해금. 픽 한도 = tier-1(2차 1·3차 2·4차 3).
// docs/v2-job-spec-passives-plan.md §5. 골드/쿨다운 없음(진척). lock: character.v2 → proficiency.v2.

type CharSaveShape = {
  class?: unknown;
  level?: number;
  specChoice?: unknown;
  unlockedPassives?: unknown;
  [k: string]: unknown;
};

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { specId?: unknown; passiveId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const specId = typeof body.specId === "string" ? body.specId : null;
  const passiveId = typeof body.passiveId === "string" ? body.passiveId : null;
  if (!specId && !passiveId) {
    return Response.json(
      { ok: false, error: "bad_request" },
      { status: 400 },
    );
  }

  const result = await db.transaction(async (tx) => {
    const charSave = await lockSaveForUpdate<CharSaveShape>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const cls = parseV2Class(charSave.class);
    if (cls === "none") {
      return { status: 400, body: { ok: false as const, error: "no_class" as const } };
    }
    const prof = parseProficiencyForChar(
      await lockSaveForUpdate<V2ProficiencyState>(
        tx,
        userId,
        "proficiency.v2",
        emptyProficiency(),
      ),
      charSave,
    );
    const group = tier1ClassOf(cls);
    const tier = prof.groups[group]?.tier ?? 1;
    // 계파는 2차 전직부터.
    if (tier < 2) {
      return {
        status: 400,
        body: { ok: false as const, error: "tier_too_low" as const, required: 2 },
      };
    }

    const jobSpecs = V2_JOB_SPECS[cls] ?? [];
    const curSpecId =
      typeof charSave.specChoice === "string" ? charSave.specChoice : null;
    const unlocked = Array.isArray(charSave.unlockedPassives)
      ? charSave.unlockedPassives.filter((x): x is string => typeof x === "string")
      : [];

    // ── 계파 선택 ───────────────────────────────────────────────
    if (specId) {
      const spec = jobSpecs.find((s) => s.id === specId);
      if (!spec) {
        return {
          status: 400,
          body: { ok: false as const, error: "bad_spec" as const },
        };
      }
      // 같은 계파 재선택 = 멱등. 다른 계파로 변경은 잠김(신전 초기화로만).
      if (curSpecId && curSpecId !== specId) {
        return {
          status: 409,
          body: { ok: false as const, error: "spec_locked" as const },
        };
      }
      if (curSpecId !== specId) {
        await upsertSave(tx, userId, "character.v2", {
          ...charSave,
          specChoice: specId,
        });
        // 계파 첫 선택 시 그 계파 무기 1회 지급(게이트 활성화). 이미 보유면 skip.
        // lock 순서: character.v2 → proficiency.v2 → equipment.v2 (일관 순서, 데드락 회피).
        const weaponId = starterWeaponForType(spec.requiredWeaponType);
        if (weaponId) {
          const equipRaw = await lockSaveForUpdate(
            tx,
            userId,
            "equipment.v2",
            {},
          );
          const { owned, equipped } = parseEquipmentSave(equipRaw);
          if (!owned.some((i) => i.id === weaponId)) {
            await upsertSave(tx, userId, "equipment.v2", {
              owned: [...owned, { iid: genEquipIid(), id: weaponId }],
              equipped,
            });
          }
        }
      }
      return {
        status: 200,
        body: { ok: true as const, specChoice: specId, unlockedPassives: unlocked },
      };
    }

    // ── 패시브 픽 ───────────────────────────────────────────────
    if (!curSpecId) {
      return {
        status: 400,
        body: { ok: false as const, error: "no_spec" as const },
      };
    }
    const spec = jobSpecs.find((s) => s.id === curSpecId);
    if (!spec) {
      return {
        status: 400,
        body: { ok: false as const, error: "bad_spec" as const },
      };
    }
    const passive = spec.passives.find((p) => p.id === passiveId);
    if (!passive) {
      return {
        status: 400,
        body: { ok: false as const, error: "bad_passive" as const },
      };
    }
    // 이미 해금 = 멱등.
    if (unlocked.includes(passive.id)) {
      return {
        status: 200,
        body: {
          ok: true as const,
          specChoice: curSpecId,
          unlockedPassives: unlocked,
          alreadyUnlocked: true as const,
        },
      };
    }
    // 픽 한도 = tier-1 (2차 1 · 3차 2 · 4차 3).
    const maxPicks = tier - 1;
    if (unlocked.length >= maxPicks) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "no_picks_left" as const,
          have: unlocked.length,
          max: maxPicks,
        },
      };
    }
    const nextUnlocked = [...unlocked, passive.id];
    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      unlockedPassives: nextUnlocked,
    });
    return {
      status: 200,
      body: {
        ok: true as const,
        specChoice: curSpecId,
        unlockedPassives: nextUnlocked,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
