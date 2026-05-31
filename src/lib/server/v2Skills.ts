import {
  parseV2SkillsState,
  emptyV2SkillsState,
  type V2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import { parseV2Class, signaturesForClass } from "@/adventure/data/v2/classes";
import { lockSaveForUpdate, upsertSave, type DbExecutor } from "./savesKv";

// 시그니처는 숙련도로 학습(learn-skill 라우트) — 자동부여 폐지(docs §6, 2026-06).
// 여기서는 equipped 만 reconcile: 학습한 시그니처(learned) 중 현 직업 체인에 속한 것을
// 체인 순서로 자동 장착(슬롯 선택 없음 — #270 유지). learned 는 절대 안 건드림
// (재전직해도 보유 시그니처 기록 유지; 직업군 바뀌면 equipped 에서만 빠짐).
// idempotent — 이미 일치하면 noop. none(무직)/미학습 = equipped 비움(평타만).
//
// 반드시 트랜잭션(tx) 안에서 호출 — character.v2 → skills.v2 를 FOR UPDATE 로 잠가
// learn-skill 의 동시 learned 갱신을 stale 값으로 덮어쓰지 않게 한다(락 순서 통일).
export async function reconcileV2EquippedSkills(
  executor: DbExecutor,
  userId: string,
): Promise<V2SkillsState> {
  const charSave = await lockSaveForUpdate<{ class?: unknown }>(
    executor,
    userId,
    "character.v2",
    {},
  );
  const current = parseV2SkillsState(
    await lockSaveForUpdate<V2SkillsState>(
      executor,
      userId,
      "skills.v2",
      emptyV2SkillsState(),
    ),
  );
  const cls = parseV2Class(charSave.class);
  const chain = signaturesForClass(cls);
  const learnedSet = new Set<string>(current.learned);
  // equipped = 학습분 ∩ 현 체인, 체인 순서(= 발동 우선순위) 보존.
  const equipped = chain.filter((s) => learnedSet.has(s));
  const same = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && a.every((x, i) => x === b[i]);
  if (same(current.equipped, equipped)) return current;
  const next: V2SkillsState = { learned: current.learned, equipped };
  await upsertSave(executor, userId, "skills.v2", next);
  return next;
}
