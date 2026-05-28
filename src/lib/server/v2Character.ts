import { and, eq } from "drizzle-orm";
import { savesKv } from "@/db/schema";
import { upsertSave, type DbExecutor } from "./savesKv";

// character.v2 idempotent 시드 — row 없으면 빈 obj 로 만든다. 이미 있으면 noop.
// reset-me 후 또는 첫 me/state 진입 시 derive 가 null 반환하지 않게 (V2_BASE_MP / 기본
// stats 적용된 캐릭이 보이도록).
//
// 빈 obj `{}` 면 derivePlayerCombatV2 가 level ?? 1, hp ?? maxHp 등 default 로 진행.
// 사냥 / 거점 / 트레이닝 등 라우트가 실제 변경 시 캐릭터 필드 채워나간다.
export async function ensureV2Character(
  executor: DbExecutor,
  userId: string,
): Promise<void> {
  const rows = await executor
    .select({ key: savesKv.key })
    .from(savesKv)
    .where(and(eq(savesKv.userId, userId), eq(savesKv.key, "character.v2")))
    .limit(1);
  if (rows[0]) return; // 이미 있음 → noop.
  await upsertSave(executor, userId, "character.v2", {});
}
