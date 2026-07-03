import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  MAX_STAMINA,
  applyRegen,
  parseStaminaFromSave,
  staminaCapBonusOf,
  staminaOverchargeCap,
} from "@/adventure/v2/stamina";
import {
  STAMINA_POTIONS_KEY,
  STAMINA_POTION_RESTORE,
  staminaPotionCount,
} from "@/adventure/v2/staminaPotions";

// POST /api/v2/me/use-stamina-potion — 보유 스태미나 포션 사용 → 스태미나 회복(최대치 초과 비축 허용).
//   body { count? } — 한 번에 사용할 개수(미전달=1). 보유 수·1 이상으로 클램프.
//   비밀상점 "스태미나 회복약" 적용 로직 미러. 락 순서: character.v2 → stamina-potions.v1
//   (stamina-potions 는 leaf — 항상 마지막에 잠금 → 데드락 없음).

type CharSave = {
  stamina?: unknown;
  staminaCapBonus?: unknown;
  [k: string]: unknown;
};

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:me:use-stamina-potion",
    userLimit: 60,
    ipLimit: 360,
    windowMs: 60_000,
  });
  if (limited) return limited;

  // 사용 개수 — body { count }. 미전달/손상 = 1(레거시 단일 사용 호환).
  let reqCount = 1;
  try {
    const body = (await req.json()) as { count?: unknown };
    const n = Math.floor(Number(body?.count));
    if (Number.isFinite(n) && n >= 1) reqCount = n;
  } catch {
    /* 본문 없음/손상 → 1 */
  }

  const result = await db.transaction(async (tx) => {
    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const held = staminaPotionCount(
      await lockSaveForUpdate(tx, userId, STAMINA_POTIONS_KEY, { count: 0 }),
    );
    if (held <= 0) {
      return { status: 400, body: { ok: false as const, error: "no_potion" } };
    }
    const now = Date.now();
    const max = MAX_STAMINA + staminaCapBonusOf(charSave.staminaCapBonus);
    const cap = staminaOverchargeCap(max); // 포션 비축 상한(max × MULT)
    const cur = applyRegen(parseStaminaFromSave(charSave.stamina, now), now, max);
    const usefulCount = Math.max(
      0,
      Math.ceil((cap - cur.current) / STAMINA_POTION_RESTORE),
    );
    const useCount = Math.min(reqCount, held, usefulCount); // 보유·상한 초과 클램프(서버 권위).
    if (useCount <= 0) {
      return {
        status: 400,
        body: { ok: false as const, error: "stamina_cap" },
      };
    }
    const nextStamina = {
      // 포션으로 최대치를 넘겨 비축(overcharge) — 단 상한(cap)까지만.
      //   "한 번에 많이 먹어두고 길게 사냥" 의도. 시간 회복은 여전히 max 까지만(applyRegen),
      //   초과분은 사냥/이동으로만 소모. 이미 cap 이상(레거시)이면 줄이지 않음(max-guard).
      current: Math.max(
        cur.current,
        Math.min(cap, cur.current + STAMINA_POTION_RESTORE * useCount),
      ),
      lastUpdatedAt: cur.lastUpdatedAt,
    };
    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      stamina: nextStamina,
    });
    await upsertSave(tx, userId, STAMINA_POTIONS_KEY, { count: held - useCount });
    return {
      status: 200,
      body: {
        ok: true as const,
        count: held - useCount,
        used: useCount,
        stamina: nextStamina.current,
        max,
        restored: nextStamina.current - cur.current,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
