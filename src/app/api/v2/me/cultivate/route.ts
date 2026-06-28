import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { parseV2Class, tier1ClassOf } from "@/adventure/data/v2/classes";
import { jobIdFromLegacy } from "@/adventure/data/v2/v2JobCatalog";
import {
  parseProficiencyForChar,
  applyCultivation,
  emptyProficiency,
  usablePoints,
  cultivationCost,
  totalCapGains,
  capGain,
  effectiveStatCap,
  V2_CULTIVATE_PROFILE,
  type V2ProficiencyState,
} from "@/adventure/data/v2/proficiency";
import { computeStatFloors } from "@/adventure/data/v2/statGrowth";
import { V2_STAT_KEYS } from "@/adventure/data/v2/v2StatKeys";

// POST /api/v2/me/cultivate — 수행 1회. 현 직업군 숙달 포인트로 stat cap 상승.
// docs/v2-proficiency-redesign.md §4. 골드/쿨다운 없음. lock 순서 character.v2 → proficiency.v2.
export async function POST() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const result = await db.transaction(async (tx) => {
    const charSave = await lockSaveForUpdate<{
      class?: unknown;
      specChoice?: unknown;
    }>(tx, userId, "character.v2", {});
    const cls = parseV2Class(charSave.class);
    const group = tier1ClassOf(cls);
    // 하이브리드(마검사·성기사)는 저장 class 가 직군(전사)이라 직군 프로필만으론 정체성 축을 못 키운다.
    //   jobId 로 직업 전용 프로필을 적용한다(회계는 group 그대로). spec 미상이면 group 폴백.
    const spec =
      typeof charSave.specChoice === "string" ? charSave.specChoice : null;
    const jobId = jobIdFromLegacy(cls, spec);
    // 수행 프로필이 있는 직군만 수행 가능 — none(모험가)도 프로필 추가로 허용. 프로필 없는 그룹만 거부
    //   (일반화: 향후 직군 밖 직업도 V2_CULTIVATE_PROFILE 에 프로필 있으면 자동 허용).
    if (!V2_CULTIVATE_PROFILE[group]) {
      return { status: 400, body: { ok: false as const, error: "no_class" as const } };
    }
    const profSave = await lockSaveForUpdate<V2ProficiencyState>(
      tx,
      userId,
      "proficiency.v2",
      emptyProficiency(),
    );
    const prof = parseProficiencyForChar(profSave, charSave);
    // 크리티컬 다중 수행 — Math.random 로 mult 굴림(낮은 확률 ×3/×5).
    const applied = applyCultivation(prof, group, Math.random, undefined, jobId);
    if (!applied) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "insufficient_proficiency" as const,
          required: cultivationCost(totalCapGains(prof)),
          have: usablePoints(prof),
        },
      };
    }
    await upsertSave(tx, userId, "proficiency.v2", applied.next);
    const nextCult = applied.next.groups[group].cultivations;
    // 유효 cap(= floor + 헤드룸 + 수행이득) 으로 반환 — state 와 일치.
    const floors = computeStatFloors(applied.next);
    const effectiveCaps: Partial<Record<string, number>> = {};
    for (const k of V2_STAT_KEYS) {
      effectiveCaps[k] = effectiveStatCap(floors[k] ?? 0, capGain(applied.next, k));
    }
    return {
      status: 200,
      body: {
        ok: true as const,
        spent: applied.cost,
        mult: applied.mult, // 크리티컬 배수(1/3/5) — UI 표시용.
        group,
        caps: effectiveCaps,
        cultivations: nextCult,
        points: usablePoints(applied.next),
        nextCost: cultivationCost(totalCapGains(applied.next)),
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
