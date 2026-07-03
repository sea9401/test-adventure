import {
  parseV2SkillsState,
  emptyV2SkillsState,
  type V2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import {
  parseV2Class,
  elementalSkillsForClass,
} from "@/adventure/data/v2/classes";
import {
  parseProficiencyForChar,
  emptyProficiency,
  type V2ProficiencyState,
} from "@/adventure/data/v2/proficiency";
import {
  V2_CORE_LOOP_V2,
  calcSpBudget,
} from "@/adventure/data/v2/coreLoopConfig";
import { jobUnlockSpBonus } from "@/adventure/data/v2/v2JobCatalog";
import { sanitizeLoadout } from "@/adventure/data/v2/v2Loadout";
import { spCapBonusFromRaw } from "@/adventure/data/v2/spFruit";
import { readCodexSpBonus } from "./codexSpBonus";
import { lockSaveForUpdate, upsertSave, type DbExecutor } from "./savesKv";

// 전투 입력용 — 저장된 equipped 를 SP 예산/학습 상태에 맞게 in-memory sanitize(코어루프). DB 미기록.
//   reconcileV2EquippedSkills 가 state 로드마다 영속 sanitize 하지만, state 로드 없이 곧장 전투로
//   오는 경로(사냥·아레나)도 예산을 강제하려면 전투 직전 한 번 더 정리해야 한다.
//   flag off = 원본 그대로(byte-identical). 순수(부수효과 없음).
export function sanitizeCombatLoadout(
  skills: V2SkillsState,
  charSave: unknown,
  proficiencyRaw: unknown,
  collectionBonusSp = 0,
): V2SkillsState {
  if (!V2_CORE_LOOP_V2) return skills;
  const cs = (charSave ?? {}) as {
    class?: unknown;
    specChoice?: unknown;
    level?: unknown;
    spFruitUsed?: unknown;
  };
  const prof = parseProficiencyForChar(proficiencyRaw, cs);
  return {
    ...skills,
    equipped: sanitizeLoadout(
      skills.equipped,
      skills.learned,
      calcSpBudget(
        prof.groups,
        spCapBonusFromRaw(cs.spFruitUsed),
        collectionBonusSp,
        jobUnlockSpBonus(prof),
      ),
    ),
  };
}

// 코어루프 — equipped 는 플레이어가 저장한 수동 SP 로드아웃이다. state 로드 시에는 learned/SP
// 예산 기준으로만 sanitize 하고, 직업 체인으로 강제 재산출하지 않는다. learned 는 절대 안 건드림.
// flag off 레거시만 "학습한 스킬 중 현 체인 유효분 전부"로 자동 산출한다.
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
    spFruitUsed?: unknown;
  }>(executor, userId, "character.v2", {});
  const current = parseV2SkillsState(
    await lockSaveForUpdate<V2SkillsState>(
      executor,
      userId,
      "skills.v2",
      emptyV2SkillsState(),
    ),
  );
  const prof = parseProficiencyForChar(
    await lockSaveForUpdate<V2ProficiencyState>(
      executor,
      userId,
      "proficiency.v2",
      emptyProficiency(),
    ),
    charSave,
  );
  // flag off(레거시): equipped = 학습한 스킬 중 현 체인 유효분 전부(상한 없음·자동 산출). learn 순서 유지.
  // 코어루프: equipped 는 플레이어가 고른 로드아웃 → 강제 재산출 금지. sanitize 만(보존 +
  //   무효분/예산 초과 정리). SP 예산 강제·환생 마이그가 여기서 일어난다(state 로드마다 호출).
  const equipped = V2_CORE_LOOP_V2
    ? await (async () => {
        const codexBonus = await readCodexSpBonus(executor, userId);
        return sanitizeLoadout(
          current.equipped,
          current.learned,
          calcSpBudget(
            prof.groups,
            spCapBonusFromRaw(charSave.spFruitUsed),
            codexBonus.total,
            jobUnlockSpBonus(prof),
          ),
        );
      })()
    : (() => {
        const cls = parseV2Class(charSave.class);
        const specChoice =
          typeof charSave.specChoice === "string" ? charSave.specChoice : null;
        const chain = new Set(elementalSkillsForClass(cls, specChoice));
        return current.learned.filter((s) => chain.has(s));
      })();
  const same = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && a.every((x, i) => x === b[i]);
  if (same(current.equipped, equipped)) return current;
  const next: V2SkillsState = { learned: current.learned, equipped };
  await upsertSave(executor, userId, "skills.v2", next);
  return next;
}
