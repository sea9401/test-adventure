import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { derivePlayerCombatV2FromSaves } from "@/lib/server/derivePlayerCombatV2FromSaves";
import { DerivedPlayerCombatV2, SavedCharacterV2 } from "@/lib/server/derivePlayerCombatV2Pure";
import type { DbExecutor } from "@/lib/server/savesKv";
import { and, eq, inArray } from "drizzle-orm";
export { derivePlayerCombatV2FromSaves } from "@/lib/server/derivePlayerCombatV2FromSaves";
export { type DerivePlayerCombatV2PureInput, type DerivedPlayerCombatV2, type SavedCharacterV2, derivePlayerCombatV2Pure, stackedDamageReductionPct, stackedDefenseIncreasePct, stackedMaxHpIncreasePct, stackedVitalityIncreasePct, v2LevelGrowthHpMp } from "@/lib/server/derivePlayerCombatV2Pure";
export {
  aggregateV2Equipment,
  collectEquipSignatures,
  type V2EquipAggregate
} from "./derivePlayerEquipmentV2";


// 외부 import 경로 안정성 — 옛 derivePlayerCombatV2 의 public 상수를 v2CombatCoefficients
//   에서 그대로 재-export 한다(derivePlayerCombatV2.test.ts 등이 이 경로로 import).
export {
  CRIT_MULT_CEIL,
  CRIT_MULT_SCALE,
  MAGIC_ATK_PER_EXCESS_SPI,
  MAGIC_ATK_PER_INT,
  MAGIC_ATK_PER_SPI,
  MIN_DMG_PER_SPI,
  V2_BASE_COMBAT_BONUS,
  VIT_ATK_COEF
} from "./v2CombatCoefficients";


// PR-S2: V2_BASE_STATS / V2_STAT_POINTS_PER_LEVEL 은 v2Stats.ts 로 분리 (클라 import 가능).
// 여기서는 backward compat 을 위해 re-export.
export { V2_BASE_STATS, V2_STAT_POINTS_PER_LEVEL } from "@/adventure/data/v2/v2Stats";


// DB select 래퍼 — v2 save 를 read 후 FromSaves 로 derive. 9개 라우트가 그대로 사용.
//   preloaded — 호출부가 이미 lock-read 한 save 를 넘기면 그 키는 재select 하지 않는다
//   (사냥 배치의 판당 중복 read 절감). character/equipment 뿐 아니라 proficiency/skills 도
//   preload 가능 — 4개 모두 넘기면 select 자체를 건너뛴다(사냥 라우트가 4개를 upfront lock-read).
//   넘긴 값은 같은 tx 의 락-read 라 select 결과와 동일 → derive 결과 byte-동일.
export async function derivePlayerCombatV2(
  userId: string,
  executor: DbExecutor = db,
  preloaded?: {
    character?: SavedCharacterV2;
    equipmentSave?: unknown;
    proficiencyRaw?: unknown;
    skillsRaw?: unknown;
    includeCookingBuff?: boolean;
  },
): Promise<DerivedPlayerCombatV2 | null> {
  const haveChar = preloaded?.character !== undefined;
  const haveEquip = preloaded?.equipmentSave !== undefined;
  const haveProf = preloaded?.proficiencyRaw !== undefined;
  const haveSkills = preloaded?.skillsRaw !== undefined;
  const keys = [
    ...(haveChar ? [] : (["character.v2"] as const)),
    ...(haveEquip ? [] : (["equipment.v2"] as const)),
    ...(haveProf ? [] : (["proficiency.v2"] as const)),
    ...(haveSkills ? [] : (["skills.v2"] as const)),
  ];

  let character: SavedCharacterV2 | undefined = preloaded?.character;
  let equipmentSave: unknown = preloaded?.equipmentSave;
  let proficiencyRaw: unknown = preloaded?.proficiencyRaw;
  let skillsRaw: unknown = preloaded?.skillsRaw;
  // 미preload 키만 select. 4개 모두 preload(사냥 라우트)면 빈 배열 → DB 왕복 0.
  if (keys.length > 0) {
    const rows = await executor
      .select({ key: savesKv.key, value: savesKv.value })
      .from(savesKv)
      .where(and(eq(savesKv.userId, userId), inArray(savesKv.key, [...keys])));
    for (const r of rows) {
      if (r.key === "character.v2") character = r.value as SavedCharacterV2;
      else if (r.key === "equipment.v2") equipmentSave = r.value;
      else if (r.key === "proficiency.v2") proficiencyRaw = r.value;
      else if (r.key === "skills.v2") skillsRaw = r.value;
    }
  }
  return derivePlayerCombatV2FromSaves({
    character,
    equipmentSave,
    proficiencyRaw,
    skillsRaw,
    includeCookingBuff: preloaded?.includeCookingBuff,
  });
}
