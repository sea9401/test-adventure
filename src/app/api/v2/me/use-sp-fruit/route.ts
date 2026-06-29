import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
} from "@/lib/server/savesKv";
import {
  parseProficiencyForChar,
  emptyProficiency,
  type V2ProficiencyState,
} from "@/adventure/data/v2/proficiency";
import { calcSpBudget } from "@/adventure/data/v2/coreLoopConfig";
import {
  SP_FRUIT,
  SP_FRUIT_TIERS,
  parseSpFruitUsed,
  spCapBonusFromFruits,
  type SpFruitTier,
} from "@/adventure/data/v2/spFruit";
import { readCodexSpBonus } from "@/lib/server/codexSpBonus";

// POST /api/v2/me/use-sp-fruit — SP 열매(협동 보스 드랍 소모품) 1개 사용 → SP 최대치 +1(영구).
//   body { tier } — 1|2|3. 보유(character.v2.materials[materialId]) + 사용 캡(spFruitUsed[tier] <
//   useCap) 검증 → 재료 1 소모 + 사용 횟수 +1. 캡 도달분은 사용 차단(거래소 거래만).
//   락: character.v2(소모/사용기록 쓰기) → proficiency.v2(예산 산정용·비잠금 읽기, 단조 증가라
//   stale 안전). use-stamina-potion 라우트 패턴 미러.

type CharSave = {
  class?: unknown;
  level?: unknown;
  materials?: unknown;
  spFruitUsed?: unknown;
  [k: string]: unknown;
};

// materials map(id→count) 안전 파싱 — 양수 정수만 보존.
function parseMaterials(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const n = Math.floor(Number(v));
      if (Number.isFinite(n) && n > 0) out[k] = n;
    }
  }
  return out;
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let tier: SpFruitTier | null = null;
  try {
    const body = (await req.json()) as { tier?: unknown };
    const n = Math.floor(Number(body?.tier));
    if ((SP_FRUIT_TIERS as readonly number[]).includes(n)) {
      tier = n as SpFruitTier;
    }
  } catch {
    /* 본문 없음/손상 → tier null */
  }
  if (tier === null) {
    return Response.json(
      { ok: false, error: "invalid_tier" },
      { status: 400 },
    );
  }
  const def = SP_FRUIT[tier];

  const result = await db.transaction(async (tx) => {
    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const materials = parseMaterials(charSave.materials);
    const used = parseSpFruitUsed(charSave.spFruitUsed);

    const held = materials[def.materialId] ?? 0;
    if (held <= 0) {
      return { status: 400, body: { ok: false as const, error: "no_fruit" } };
    }
    if (used[tier] >= def.useCap) {
      // 캡 도달 — 더 못 쓰고 보유·거래소 거래만(오너 결정: 사용 차단·판매만).
      return {
        status: 400,
        body: { ok: false as const, error: "use_cap_reached" },
      };
    }

    // 재료 1 소모 + 사용 횟수 +1.
    const nextMaterials = { ...materials };
    if (held - 1 <= 0) delete nextMaterials[def.materialId];
    else nextMaterials[def.materialId] = held - 1;
    const nextUsed = { ...used, [tier]: used[tier] + def.spPerUse };

    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      materials: nextMaterials,
      spFruitUsed: nextUsed,
    });

    // 새 SP 예산 — proficiency 비잠금 읽기(단조 증가, 이 tx 쓰기잠금 순서에 영향 없음).
    const prof = parseProficiencyForChar(
      await readSave<V2ProficiencyState>(
        tx,
        userId,
        "proficiency.v2",
        emptyProficiency(),
      ),
      charSave,
    );
    const capBonus = spCapBonusFromFruits(nextUsed);
    const spBudget = calcSpBudget(
      prof.groups,
      capBonus,
      (await readCodexSpBonus(tx, userId)).total,
    );

    return {
      status: 200,
      body: {
        ok: true as const,
        tier,
        used: nextUsed,
        capBonus,
        spBudget,
        materialCount: nextMaterials[def.materialId] ?? 0,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
