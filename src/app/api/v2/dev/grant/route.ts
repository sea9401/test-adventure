import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  STAMINA_POTIONS_KEY,
  staminaPotionCount,
} from "@/adventure/v2/staminaPotions";
import { applyExpGain, MAX_LEVEL } from "@/lib/leveling";
import { parseV2Class, tier1ClassOf } from "@/adventure/data/v2/classes";
import {
  parseProficiencyForChar,
  emptyProficiency,
  addPoints,
  addCumLevel,
  addJobCumLevel,
  groupCumLevel,
  usablePoints,
  type V2ProficiencyState,
} from "@/adventure/data/v2/proficiency";
import { jobIdFromLegacy } from "@/adventure/data/v2/v2JobCatalog";
import {
  V2_MATERIALS,
  mergeDrops,
  type DropResult,
  type V2MaterialId,
} from "@/adventure/data/v2/dungeonDrops";

// POST /api/v2/dev/grant — 테스트용 일괄 지급 (EXP / 레벨 / 골드 / 재료 / 충전약 / 숙련도).
//
// ⚠️ DEV 전용 도구. 지울 땐 이 폴더(src/app/api/v2/dev/grant)와
//    src/app/dev/v2-tools 만 통째로 지우면 됨 — 게임 코드 의존 0.
//
// 본문(전부 선택, 들어온 것만 적용):
//   { exp?, gold?, hpCharges?, mpCharges?, setLevel?,
//     materials?: { [V2MaterialId]: number }, proficiency?, mastery? }
//   - proficiency: 공용 숙달 포인트 += 값. 수행/학습 QA 시드용.
//   - mastery: 현재 직업의 직군/직업별 숙련도 += 값. 해금/SP/랭킹 QA 시드용.
//
// 본인(로그인 user)의 character.v2 / inventory.v2 / proficiency.v2 갱신.
// 라이브 prod 에선 IS_STAGING 게이트 (staging 외 → 404). grant-equipment 와 동일.

// 입력 상한 — 오버플로/실수 방지. 충분히 큼.
const MAX_GRANT = 1_000_000_000;

function clampInt(n: unknown, min: number, max: number): number {
  // 비-숫자/NaN 입력은 min 으로 — setLevel(min=1)이 0 으로 떨어져 level:0 을 저장하는
  // 버그 방지. exp/gold/charges 는 min=0 이라 동작 동일(무효 입력 → 0 → 건너뜀).
  if (typeof n !== "number" || !Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export async function POST(req: Request) {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.IS_STAGING !== "true"
  ) {
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: {
    exp?: unknown;
    gold?: unknown;
    hpCharges?: unknown;
    mpCharges?: unknown;
    staminaPotions?: unknown;
    setLevel?: unknown;
    materials?: unknown;
    proficiency?: unknown;
    mastery?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const expGain = clampInt(body.exp, 0, MAX_GRANT);
  const goldGain = clampInt(body.gold, 0, MAX_GRANT);
  const hpChargeGain = clampInt(body.hpCharges, 0, MAX_GRANT);
  const mpChargeGain = clampInt(body.mpCharges, 0, MAX_GRANT);
  const staminaPotionGain = clampInt(body.staminaPotions, 0, MAX_GRANT);
  const setLevel =
    body.setLevel == null ? null : clampInt(body.setLevel, 1, MAX_LEVEL);
  const proficiencyGain = clampInt(body.proficiency, 0, MAX_GRANT);
  const masteryGain = clampInt(body.mastery, 0, MAX_GRANT);

  // 재료 정리 — 유효 V2MaterialId + 양수만 통과.
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

  const result = await db.transaction(async (tx) => {
    type CharSave = {
      level?: number;
      exp?: number;
      gold?: number;
      materials?: unknown;
      class?: unknown;
      [k: string]: unknown;
    };
    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );

    let level = Math.max(1, Math.min(MAX_LEVEL, charSave.level ?? 1));
    let exp = Math.max(0, charSave.exp ?? 0);
    let levelsGained = 0;

    // 레벨 직접 지정(있으면 먼저). 올라간 만큼만 단련 포인트 적립.
    if (setLevel != null && setLevel !== level) {
      if (setLevel > level) levelsGained += setLevel - level;
      level = setLevel;
      exp = 0;
    }

    // EXP 부여 — 정식 레벨업 로직 그대로 (단련 포인트 적립까지 사냥과 동일).
    if (expGain > 0) {
      const r = applyExpGain(level, exp, expGain);
      levelsGained += r.levelsGained;
      level = r.level;
      exp = r.exp;
    }

    const gold = Math.max(0, (charSave.gold ?? 0) + goldGain);
    const materials =
      Object.keys(matGrant).length > 0
        ? mergeDrops(charSave.materials, matGrant)
        : charSave.materials;

    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      level,
      exp,
      gold,
      materials,
    });

    // 숙달 포인트/직업 숙련도 지급 — QA 시드용.
    // (옛 training.v2 단련 포인트 지급은 수동분배 폐지로 제거 — docs 숙련도 재설계.)
    let proficiencyEarned: number | null = null;
    let masteryEarned: number | null = null;
    if (proficiencyGain > 0 || masteryGain > 0) {
      const cls = parseV2Class(charSave.class);
      const group = tier1ClassOf(cls);
      if (group !== "none") {
        const profSave = await lockSaveForUpdate<V2ProficiencyState>(
          tx,
          userId,
          "proficiency.v2",
          emptyProficiency(),
        );
        const nextProf = addPoints(
          // dev 도구가 같은 요청에서 레벨을 올릴 수 있어, cumLevel 시드는 갱신된 level 사용.
          parseProficiencyForChar(profSave, { class: charSave.class, level }),
          group,
          proficiencyGain,
        );
        const withMastery =
          masteryGain > 0
            ? addJobCumLevel(
                addCumLevel(nextProf, group, masteryGain),
                jobIdFromLegacy(
                  cls,
                  typeof charSave.specChoice === "string"
                    ? charSave.specChoice
                    : null,
                ),
                masteryGain,
              )
            : nextProf;
        await upsertSave(tx, userId, "proficiency.v2", withMastery);
        if (proficiencyGain > 0) proficiencyEarned = usablePoints(withMastery);
        if (masteryGain > 0) masteryEarned = groupCumLevel(withMastery, group);
      }
    }

    // 충전약 (inventory.v2). 지급분이 있을 때만 갱신 + 응답에 포함.
    const charges: { hpCharges?: number; mpCharges?: number } = {};
    if (hpChargeGain > 0 || mpChargeGain > 0) {
      const invSave = await lockSaveForUpdate<{
        hpCharges?: number;
        mpCharges?: number;
        [k: string]: unknown;
      }>(tx, userId, "inventory.v2", {});
      charges.hpCharges = Math.max(0, invSave.hpCharges ?? 0) + hpChargeGain;
      charges.mpCharges = Math.max(0, invSave.mpCharges ?? 0) + mpChargeGain;
      await upsertSave(tx, userId, "inventory.v2", {
        ...invSave,
        ...charges,
      });
    }

    // 스태미나 포션(stamina-potions.v1, 전용 키 — leaf 마지막 잠금). 지급분이 있을 때만.
    let staminaPotions: number | undefined;
    if (staminaPotionGain > 0) {
      const cur = staminaPotionCount(
        await lockSaveForUpdate(tx, userId, STAMINA_POTIONS_KEY, { count: 0 }),
      );
      staminaPotions = cur + staminaPotionGain;
      await upsertSave(tx, userId, STAMINA_POTIONS_KEY, {
        count: staminaPotions,
      });
    }

    return {
      ok: true as const,
      level,
      exp,
      gold,
      levelsGained,
      materials,
      ...(proficiencyEarned != null ? { proficiencyEarned } : {}),
      ...(masteryEarned != null ? { masteryEarned } : {}),
      ...charges,
      ...(staminaPotions != null ? { staminaPotions } : {}),
    };
  });

  return Response.json(result);
}
