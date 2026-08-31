import { savesKv } from "@/db/schema";
import { emptyProficiency, parseProficiency } from "@/adventure/data/v2/proficiency";
import { rollInitialLifeResourceGrowth } from "@/adventure/data/v2/lifeResourceGrowth";
import { lifeResourceRangesForProficiency } from "@/adventure/data/v2/statGrowth";
import { lockSaveForUpdate, upsertSave, type DbExecutor } from "./savesKv";

// character.v2 idempotent 시드 — row 없으면 빈 obj 로 만든다. 이미 있으면 noop.
// reset-me 후 또는 첫 me/state 진입 시 derive 가 null 반환하지 않게 (V2_BASE_MP / 기본
// stats 적용된 캐릭이 보이도록).
//
// 빈 obj `{}` 면 derivePlayerCombatV2 가 level ?? 1, hp ?? maxHp 등 default 로 진행.
// 사냥 / 거점 / 트레이닝 등 라우트가 실제 변경 시 캐릭터 필드 채워나간다.
export async function ensureV2Character(
  executor: DbExecutor,
  userId: string,
  rng: () => number = Math.random,
): Promise<void> {
  const inserted = await executor
    .insert(savesKv)
    .values({
      userId,
      key: "character.v2",
      value: {},
      version: 1,
      updatedAt: new Date(),
    })
    .onConflictDoNothing({ target: [savesKv.userId, savesKv.key] })
    .returning({ key: savesKv.key });
  if (!inserted[0]) return; // 이미 있음 → noop. 동시 최초 진입도 선점한 트랜잭션만 진행.
  const proficiency = parseProficiency(
    await lockSaveForUpdate(
      executor,
      userId,
      "proficiency.v2",
      emptyProficiency(),
    ),
  );
  const lifeResourceGrowth = rollInitialLifeResourceGrowth(
    lifeResourceRangesForProficiency(proficiency),
    rng,
  );
  await upsertSave(executor, userId, "proficiency.v2", {
    ...proficiency,
    lifeResourceGrowth,
  });
}
