import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { reconcileV2EquippedSkills } from "@/lib/server/v2Skills";

// POST /api/v2/me/temple-reset — 신전 초기화(무료 리스펙, 테스트 기간).
// 전문화(specChoice) + 해금 패시브(unlockedPassives) 를 비워 다시 고를 수 있게 한다.
// docs/v2-job-spec-passives-plan.md §8 — 테스트 기간엔 무료, 정식 적용 후 유료화(가격 TBD).
// (수행 cap 리셋은 자유수행 wiring 과 결합 → 별도 후속. 여기선 전문화/패시브만.)
// lock: character.v2 → skills.v2 (reconcile).

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
    // 전문화가 비워졌으니 장착 스킬을 공용 풀로 회수 — 옛 전문화 스킬이 equipped 에 남아
    // 전투에서 발동하지 않도록(reconcile = 학습분 ∩ 현 풀). character.v2 직후 skills.v2 락.
    await reconcileV2EquippedSkills(tx, userId);
  });

  return Response.json({ ok: true });
}
