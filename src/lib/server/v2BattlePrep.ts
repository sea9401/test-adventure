import {
  emptyProficiency,
  type V2ProficiencyState,
} from "@/adventure/data/v2/proficiency";
import {
  emptyV2SkillsState,
  parseV2SkillsState,
  type V2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import type { JobUnlockContext } from "@/adventure/data/v2/v2JobCatalog";
import { V2_CORE_LOOP_V2 } from "@/adventure/data/v2/coreLoopConfig";
import { readCodexSpBonus } from "@/lib/server/codexSpBonus";
import { readJobUnlockContext } from "@/lib/server/jobUnlockContext";
import {
  derivePlayerCombatV2,
  type DerivedPlayerCombatV2,
  type SavedCharacterV2,
} from "@/lib/server/derivePlayerCombatV2";
import {
  lockSaveForUpdate,
  readSave,
  type DbExecutor,
} from "@/lib/server/savesKv";
import { sanitizeCombatLoadout } from "@/lib/server/v2Skills";

type SavedCharacterForBattle = SavedCharacterV2 & Record<string, unknown>;

export type PreparedV2BattleActor = {
  player: DerivedPlayerCombatV2;
  skills: V2SkillsState;
  storedSkills: V2SkillsState;
  skillsRaw: unknown;
  proficiencyRaw: V2ProficiencyState;
  equipmentSave: unknown;
};

/**
 * 같은 트랜잭션에서 전투를 연속 실행할 때 변하지 않는 준비 데이터를 재사용한다.
 * 첫 전투가 save row 잠금을 잡으므로 이후 전투는 캐시된 최신 proficiency를 사용해도
 * 다른 요청과 섞이지 않는다.
 */
export type V2BattlePrepCache = {
  skillsRaw?: unknown;
  proficiencyRaw?: V2ProficiencyState;
  codexBonus?: Awaited<ReturnType<typeof readCodexSpBonus>>;
  jobUnlockCtx?: JobUnlockContext;
};

export async function prepareV2BattleActor({
  tx,
  userId,
  charSave,
  equipmentSave: preloadedEquipmentSave,
  deriveSkills = "stored",
  includeCookingBuff = true,
  lockForUpdate = true,
  cache,
}: {
  tx: DbExecutor;
  userId: string;
  charSave: SavedCharacterForBattle;
  equipmentSave?: unknown;
  deriveSkills?: "stored" | "sanitized";
  /** 거점전처럼 플레이어 간 전투이면 false. */
  includeCookingBuff?: boolean;
  /** 저장 변경이 없는 연습 전투에서는 false로 두어 행 잠금을 피한다. */
  lockForUpdate?: boolean;
  /** 동일 tx 안에서 반복 전투할 때만 전달하는 배치 범위 캐시. */
  cache?: V2BattlePrepCache;
}): Promise<PreparedV2BattleActor | null> {
  const loadSave = <T>(key: string, fallback: T) =>
    lockForUpdate
      ? lockSaveForUpdate<T>(tx, userId, key, fallback)
      : readSave<T>(tx, userId, key, fallback);
  const equipmentSave =
    preloadedEquipmentSave ??
    (await loadSave("equipment.v2", {}));
  const skillsRaw =
    cache?.skillsRaw !== undefined
      ? cache.skillsRaw
      : await loadSave(
          "skills.v2",
          emptyV2SkillsState() as unknown as Record<string, unknown>,
        );
  const proficiencyRaw =
    cache?.proficiencyRaw !== undefined
      ? cache.proficiencyRaw
      : await loadSave<V2ProficiencyState>(
          "proficiency.v2",
          emptyProficiency(),
        );
  if (cache) {
    cache.skillsRaw = skillsRaw;
    cache.proficiencyRaw = proficiencyRaw;
  }
  const storedSkills = parseV2SkillsState(skillsRaw);
  const codexBonus = V2_CORE_LOOP_V2
    ? (cache?.codexBonus ?? (await readCodexSpBonus(tx, userId)))
    : null;
  if (cache && codexBonus) cache.codexBonus = codexBonus;
  const jobUnlockCtx = V2_CORE_LOOP_V2
    ? (cache?.jobUnlockCtx ?? (await readJobUnlockContext(tx, userId)))
    : undefined;
  if (cache && jobUnlockCtx) cache.jobUnlockCtx = jobUnlockCtx;
  const skills = V2_CORE_LOOP_V2
    ? sanitizeCombatLoadout(
        storedSkills,
        charSave,
        proficiencyRaw,
        codexBonus?.total ?? 0,
        jobUnlockCtx,
      )
    : storedSkills;
  const deriveSkillsRaw =
    deriveSkills === "sanitized"
      ? { ...storedSkills, equipped: skills.equipped }
      : skillsRaw;
  const player = await derivePlayerCombatV2(userId, tx, {
    character: charSave,
    equipmentSave,
    proficiencyRaw,
    skillsRaw: deriveSkillsRaw,
    includeCookingBuff,
  });
  if (!player) return null;

  return {
    player,
    skills,
    storedSkills,
    skillsRaw,
    proficiencyRaw,
    equipmentSave,
  };
}
