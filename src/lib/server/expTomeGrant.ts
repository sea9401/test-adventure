import { applyExpGain } from "@/lib/leveling";
import { parseV2Class, tier1ClassOf } from "@/adventure/data/v2/classes";
import {
  parseProficiencyForChar,
  addCumLevel,
  addJobCumLevel,
  setGrown,
  effectiveLevelCap,
  type V2ProficiencyState,
} from "@/adventure/data/v2/proficiency";
import { jobIdFromLegacy } from "@/adventure/data/v2/v2JobCatalog";
import { rollLevelGrowth } from "@/adventure/data/v2/statGrowth";

// 「경험치의 비약」(테스트 전용 레어맵) 1회 사용 시 지급하는 EXP.
export const EXP_TOME_GRANT = 1_000_000;

export type ExpTomeGrantResult = {
  level: number;
  exp: number;
  levelsGained: number;
  proficiency: V2ProficiencyState;
};

// hunt 라우트의 레벨업 블록(EXP → 레벨 → 직군 누적레벨 → 랜덤 스탯 성장)을 그대로 재현한다.
// 테스트용 EXP 묘약이 "한 판 사냥처럼" 캐릭터를 키우도록 — 같은 원시 함수(applyExpGain ·
// addCumLevel · rollLevelGrowth)를 써서 동작을 일치시킨다. 라이브 hunt 라우트는 건드리지 않는다.
//   - 레벨 캡: 코어루프 on = 단일 캡, off = 차수 캡(effectiveLevelCap 이 플래그 처리).
//   - 무직(none): 레벨은 오르지만 누적레벨/스탯 성장은 없음(hunt 와 동일하게 no-op).
export function applyExpTomeGrant(
  charSave: { class?: unknown; level?: number; exp?: number; specChoice?: unknown },
  proficiencyRaw: unknown,
  grant: number = EXP_TOME_GRANT,
  rand: () => number = Math.random,
): ExpTomeGrantResult {
  const playerClass = parseV2Class(charSave.class);
  const group = tier1ClassOf(playerClass);
  let prof = parseProficiencyForChar(proficiencyRaw, charSave);

  // 차수(레벨 캡 입력) — hunt 와 동일하게 prof.groups[현직군].tier ?? 1. 무직은 4차 캡.
  const classTier = group === "none" ? 4 : (prof.groups[group]?.tier ?? 1);
  const levelCap = effectiveLevelCap(group === "none" ? 4 : classTier);

  const curLevel = Math.max(1, charSave.level ?? 1);
  const curExp = Math.max(0, charSave.exp ?? 0);
  const expResult = applyExpGain(curLevel, curExp, grant, levelCap);

  if (expResult.levelsGained > 0) {
    // 직군 누적레벨 += 오른 레벨 수(floor·전직 게이트 입력, 전직 리셋에도 불변).
    //   무직(none)은 addCumLevel 내부 no-op — hunt 와 동일.
    prof = addCumLevel(prof, group, expResult.levelsGained);
    // 직업별 누적 레벨도 적립(하이브리드 해금 게이트 입력) — hunt 와 동일 동작 유지.
    const v2JobId = jobIdFromLegacy(
      playerClass,
      typeof charSave.specChoice === "string" ? charSave.specChoice : null,
    );
    prof = addJobCumLevel(prof, v2JobId, expResult.levelsGained);
    // 레벨업 수만큼 랜덤 스탯 성장 굴림 — 무직 포함 모든 직군 적용(hunt 와 동일).
    let grown = prof.grown;
    for (let i = 0; i < expResult.levelsGained; i++) {
      grown = rollLevelGrowth(grown, playerClass, prof, rand);
    }
    prof = setGrown(prof, grown);
  }

  return {
    level: expResult.level,
    exp: expResult.exp,
    levelsGained: expResult.levelsGained,
    proficiency: prof,
  };
}
