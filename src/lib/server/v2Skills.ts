import {
  parseV2SkillsState,
  emptyV2SkillsState,
  v2SkillSlotsForLevel,
  type V2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import {
  parseV2Class,
  elementalSkillsForClass,
  tier1ClassOf,
} from "@/adventure/data/v2/classes";
import {
  parseProficiencyForChar,
  emptyProficiency,
  type V2ProficiencyState,
} from "@/adventure/data/v2/proficiency";
import { lockSaveForUpdate, upsertSave, type DbExecutor } from "./savesKv";

// 장착 가능 = 공용 + 선택 전문화의 차수 해금분(시그니처는 패시브 전환 — learned 에만 남고 비장착,
// parseV2SkillsState 가 equipped 에서 제거). 여기서는 equipped 를 PRUNE 만 한다(자동 추가 X):
//   - 학습 안 했거나 현 풀 밖(타전문화·차수 미해금)인 장착 제거(재전직/환생/전문화 변경 정리).
//   - 레벨 슬롯 수(v2SkillSlotsForLevel, 레벨 리셋되면 줄어듦) 초과분 절단.
// learned 는 절대 안 건드림. 플레이어가 비운/고른 슬롯은 보존(자동 채우지 않음).
// idempotent — 이미 유효하면 noop. none(무직)/미학습 = equipped 비움.
//
// 반드시 트랜잭션(tx) 안에서 호출 — character.v2 → skills.v2 → proficiency.v2 를 FOR UPDATE 로
// 잠가 learn-skill/equip-skill 의 동시 갱신을 stale 값으로 덮어쓰지 않게 한다(락 순서 통일).
export async function reconcileV2EquippedSkills(
  executor: DbExecutor,
  userId: string,
): Promise<V2SkillsState> {
  const charSave = await lockSaveForUpdate<{
    class?: unknown;
    level?: number;
    specChoice?: unknown;
  }>(executor, userId, "character.v2", {});
  const current = parseV2SkillsState(
    await lockSaveForUpdate<V2SkillsState>(
      executor,
      userId,
      "skills.v2",
      emptyV2SkillsState(),
    ),
  );
  const cls = parseV2Class(charSave.class);
  const specChoice =
    typeof charSave.specChoice === "string" ? charSave.specChoice : null;
  // 차수 — 전문화 스킬은 차수당 1개 해금(환생으로 차수 하락 시 상위 스킬 회수). lock 마지막.
  const prof = parseProficiencyForChar(
    await lockSaveForUpdate<V2ProficiencyState>(
      executor,
      userId,
      "proficiency.v2",
      emptyProficiency(),
    ),
    charSave,
  );
  const tier = prof.groups[tier1ClassOf(cls)]?.tier ?? 1;
  const chain = new Set<string>(
    elementalSkillsForClass(cls, specChoice, tier),
  );
  const learnedSet = new Set<string>(current.learned);
  const slots = v2SkillSlotsForLevel(Math.max(1, charSave.level ?? 1));
  // 유효 장착만 보존(학습 + 현 직업군 속성 풀), 플레이어가 고른 순서 유지, 슬롯 수 초과분 절단.
  const equipped = current.equipped
    .filter((s) => learnedSet.has(s) && chain.has(s))
    .slice(0, slots);
  const same = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && a.every((x, i) => x === b[i]);
  if (same(current.equipped, equipped)) return current;
  const next: V2SkillsState = { learned: current.learned, equipped };
  await upsertSave(executor, userId, "skills.v2", next);
  return next;
}
