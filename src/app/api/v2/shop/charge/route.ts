import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";

// POST /api/v2/shop/charge — HP / MP 충전 구매.
//
// body: { kind: "hp" | "mp", amount: number }
// 1g = 1 충전. 10000 cap. amount 가 cap 초과면 cap 까지 깎고 부족분 g 만 차감.
//
// response: { ok: true, gold, hpCharges, mpCharges } | { ok: false, error }
//
// 인벤토리 모델: inventory.v2.{ hpCharges, mpCharges } 0..10000 정수. 사냥 후 자동 회복에서
// 부족분 만큼 차감 — POTIONS 카탈로그 (heal_s/m/l, mp_s/m/l) 폐기 후 단순 카운터.

export const MAX_CHARGE = 10000;

type CharSave = { gold?: number; [k: string]: unknown };
type InvSave = {
  hpCharges?: number;
  mpCharges?: number;
  [k: string]: unknown;
};

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { kind?: unknown; amount?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const kind = body.kind === "hp" || body.kind === "mp" ? body.kind : null;
  const amount = Number(body.amount);
  if (!kind || !Number.isInteger(amount) || amount <= 0) {
    return Response.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const result = await db.transaction(async (tx) => {
    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const invSave = await lockSaveForUpdate<InvSave>(
      tx,
      userId,
      "inventory.v2",
      {},
    );
    const gold = Math.max(0, charSave.gold ?? 0);
    const curHp = Math.max(0, Math.min(MAX_CHARGE, invSave.hpCharges ?? 0));
    const curMp = Math.max(0, Math.min(MAX_CHARGE, invSave.mpCharges ?? 0));

    // cap 적용 — 실제 충전 가능량 = min(amount, MAX_CHARGE - current).
    const cur = kind === "hp" ? curHp : curMp;
    const room = MAX_CHARGE - cur;
    if (room <= 0) {
      return { ok: false as const, error: "already_full" };
    }
    const charge = Math.min(amount, room);
    if (gold < charge) {
      return { ok: false as const, error: "not_enough_gold" };
    }

    const newGold = gold - charge;
    const newHp = kind === "hp" ? cur + charge : curHp;
    const newMp = kind === "mp" ? cur + charge : curMp;

    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      gold: newGold,
    });
    await upsertSave(tx, userId, "inventory.v2", {
      ...invSave,
      hpCharges: newHp,
      mpCharges: newMp,
    });

    return {
      ok: true as const,
      gold: newGold,
      hpCharges: newHp,
      mpCharges: newMp,
      charged: charge,
    };
  });

  if (!result.ok) {
    return Response.json(result, { status: 400 });
  }
  return Response.json(result);
}
