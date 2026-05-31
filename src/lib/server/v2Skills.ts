import { and, eq } from "drizzle-orm";
import { savesKv } from "@/db/schema";
import {
  parseV2SkillsState,
  type V2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import { parseV2Class, signaturesForClass } from "@/adventure/data/v2/classes";
import { upsertSave, type DbExecutor } from "./savesKv";

// 플레이어 스킬 키트 = 직업 시그니처 체인뿐 (교관/학습/스타터 폐지 — 2026-06).
// 전직으로만 획득하고 자동 장착(선택 슬롯 없음). 직업이 키트를 전적으로 결정하므로
// idempotent 하게 skills.v2 를 character.v2.class 의 시그니처로 reconcile.
// none(무직) = 스킬 없음(평타만). 신규 캐 = profile/setup, 기존/직접 = state 첫 호출 시.
export async function ensureV2ClassSkills(
  executor: DbExecutor,
  userId: string,
): Promise<V2SkillsState> {
  const [skillRows, charRows] = await Promise.all([
    executor
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(and(eq(savesKv.userId, userId), eq(savesKv.key, "skills.v2")))
      .limit(1),
    executor
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(and(eq(savesKv.userId, userId), eq(savesKv.key, "character.v2")))
      .limit(1),
  ]);
  const current = parseV2SkillsState(skillRows[0]?.value);
  const cls = parseV2Class(
    (charRows[0]?.value as { class?: unknown } | null)?.class,
  );
  const sigs = signaturesForClass(cls);
  const same = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && a.every((x, i) => x === b[i]);
  // 이미 직업 시그니처와 일치하면 그대로 (idempotent).
  if (same(current.learned, sigs) && same(current.equipped, sigs)) return current;
  const next: V2SkillsState = { learned: [...sigs], equipped: [...sigs] };
  await upsertSave(executor, userId, "skills.v2", next);
  return next;
}
