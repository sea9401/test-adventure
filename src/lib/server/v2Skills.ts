import { and, eq } from "drizzle-orm";
import { savesKv } from "@/db/schema";
import {
  V2_STARTER_SKILL_IDS,
  parseV2SkillsState,
  v2SkillSlotsForLevel,
  type V2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import { upsertSave, type DbExecutor } from "./savesKv";

// 스타터 스킬 6종 (PR-1 카탈로그) 을 모든 v2 캐릭터에 자동 부여하는 idempotent
// helper. 신규 캐 = profile/setup 의 신규 분기에서 시드. 기존 staging 유저 =
// /api/v2/me/state 첫 호출 시 백필 (실제 변경 있는 경우만 upsert).
//
// 디자인 정합:
// - 학습은 영구 (한 번 보유 후 제거 X — 환불 정책 별도 PR 일 때까지).
// - 첫 시드 시 equipped 초기값 = 스타터 처음 N개 (N = 현재 캐릭 레벨의 슬롯 수).
//   level 은 character.v2 에서 직접 읽음 — caller 가 잘못된 값 전달 위험 차단.
// - 이미 equipped 있는 유저는 그 순서 보존 (사용자가 정렬한 우선순위 무시 금지).
//   손상된 저장값으로 equipped 가 빈 array 가 되면 default 시드 (보존할 의도가
//   정확히 없으므로 합리적 fallback).
export async function ensureV2StarterSkills(
  executor: DbExecutor,
  userId: string,
): Promise<V2SkillsState> {
  const rows = await executor
    .select({ value: savesKv.value })
    .from(savesKv)
    .where(and(eq(savesKv.userId, userId), eq(savesKv.key, "skills.v2")))
    .limit(1);
  const current = parseV2SkillsState(rows[0]?.value);
  const missingStarters = V2_STARTER_SKILL_IDS.filter(
    (id) => !current.learned.includes(id),
  );
  const needSeedEquipped = current.equipped.length === 0;
  if (missingStarters.length === 0 && !needSeedEquipped) return current;

  // equipped 시드 — character.v2 의 level 로 슬롯 수 결정. character row 없으면 1.
  let slotCount = v2SkillSlotsForLevel(1);
  if (needSeedEquipped) {
    const charRows = await executor
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(and(eq(savesKv.userId, userId), eq(savesKv.key, "character.v2")))
      .limit(1);
    const charValue = charRows[0]?.value as { level?: number } | null;
    const level =
      typeof charValue?.level === "number" && charValue.level > 0
        ? charValue.level
        : 1;
    slotCount = v2SkillSlotsForLevel(level);
  }
  const seededEquipped = needSeedEquipped
    ? Array.from(V2_STARTER_SKILL_IDS).slice(0, slotCount)
    : current.equipped;

  const next: V2SkillsState = {
    learned: [...current.learned, ...missingStarters],
    equipped: seededEquipped,
  };
  await upsertSave(executor, userId, "skills.v2", next);
  return next;
}
