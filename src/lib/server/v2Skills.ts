import {
  parseV2SkillsState,
  emptyV2SkillsState,
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

// 장착 슬롯 폐지 — equipped 는 더 이상 플레이어가 고르는 부분집합이 아니라 "학습한 스킬 중 현
// 체인(공용+선택 전문화의 차수 해금분) 유효분 전부"로 자동 산출한다(상한 없음). 전투/패턴이 이
// 풀에서 발동. 재전직/환생/전문화 변경으로 풀이 바뀌면 무효분은 빠지고 유효분은 자동 복원.
// learned 는 절대 안 건드림. idempotent. none(무직)/미학습 = equipped 비움.
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
  // equipped = 학습한 스킬 중 현 체인 유효분 전부(상한 없음). learn 순서 유지.
  const equipped = current.learned.filter((s) => chain.has(s));
  const same = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && a.every((x, i) => x === b[i]);
  if (same(current.equipped, equipped)) return current;
  const next: V2SkillsState = { learned: current.learned, equipped };
  await upsertSave(executor, userId, "skills.v2", next);
  return next;
}
