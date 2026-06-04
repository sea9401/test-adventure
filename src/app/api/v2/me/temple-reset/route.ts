import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";

// POST /api/v2/me/temple-reset — 신전 초기화(무료 리스펙, 테스트 기간).
// 계파(specChoice) + 해금 패시브(unlockedPassives) 를 비워 다시 고를 수 있게 한다.
// docs/v2-job-spec-passives-plan.md §8 — 테스트 기간엔 무료, 정식 적용 후 유료화(가격 TBD).
// (수행 cap 리셋은 자유수행 wiring 과 결합 → 별도 후속. 여기선 계파/패시브만.)
// lock: character.v2 단독.

type CharSaveShape = {
  specChoice?: unknown;
  unlockedPassives?: unknown;
  [k: string]: unknown;
};

export async function POST() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  await db.transaction(async (tx) => {
    const charSave = await lockSaveForUpdate<CharSaveShape>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const next = { ...charSave };
    delete next.specChoice;
    delete next.unlockedPassives;
    await upsertSave(tx, userId, "character.v2", next);
  });

  return Response.json({ ok: true });
}
