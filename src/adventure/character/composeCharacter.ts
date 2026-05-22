// 캐릭터 영구 데이터 + 장비 + 스킬 + 프로필 → 전투/렌더 양쪽에서 쓰는 합성 결과.
//
// page.tsx 가 1) PlayerCombat (전투 엔진용) 과 2) Character (UI 렌더용) 를 모두 만들 때
// 인라인으로 같은 계산(장비/스탯/스킬/HP 합산)을 두 번 하던 것을 한 번으로 통합한다.
// derivePlayerCombat 의 단일 source-of-truth 를 그대로 재사용 — 서버 협동보스도 같은
// 함수를 통해 일관된 수치를 얻는다.
//
// 순수 함수 — hook 아님. 매 render 호출되지만 derivePlayerCombat 비용은 무시 가능.

import { MAX_LEVEL, requiredExpToNext } from "@/lib/leveling";
import {
  PARAGON_TOTAL_CAP,
  cumulativeExpForPoints,
  paragonPointCost,
  pointsFromExp,
} from "@/lib/paragon";
import type { Gender } from "@/adventure/profile/avatars";
import { baseCharacter } from "./defaults";
import {
  derivePlayerCombat,
  type DerivePlayerCombatInput,
  type DerivedPlayerCombat,
} from "./derivePlayerCombat";
import type { Character, EquippedSlots } from "./types";

export type ComposeCharacterInput = DerivePlayerCombatInput & {
  name: string;
  gender: Gender;
  exp: number;
  /** 누적 파라곤 EXP — 만렙 도달 후 EXP 바를 "다음 파라곤 포인트까지" 로 치환. */
  paragonExp: number;
  gold: number;
  fame: number;
  /** UI 표시용 — 누적 처치 + 패배. */
  battleCount: number;
  /** 장착 중인 칭호 이름 (TITLES[id].name). 미장착이면 undefined. */
  titleName: string | undefined;
  affiliation?: string;
};

// DerivedPlayerCombat 가 이미 characterSkills/characterFeats/effectiveSkillNames/
// effectiveFeatNames/effectiveSkillSet/layout 을 포함하므로 여기선 character + equippedSlots 만 더한다.
export type ComposedCharacter = DerivedPlayerCombat & {
  /** UI 렌더용 캐릭터. */
  character: Character;
  /** UI 헤더/장비 화면 등이 그대로 쓰는 장착 슬롯 사본. */
  equippedSlots: EquippedSlots;
};

export function composeCharacter(
  input: ComposeCharacterInput,
): ComposedCharacter {
  const combat = derivePlayerCombat(input);
  const { totalStats, maxHp } = combat;

  // EXP 바 값. 만렙 미만: 현 레벨의 잔여/필요. 만렙 도달 후엔 같은 바가 끊기지 않고
  // 다음 파라곤 포인트까지의 진행도로 이어진다 — 익숙한 리듬 유지.
  // 풀졸업(150pt) 시엔 마지막 포인트 비용으로 가득 찬 바를 표시.
  let displayExp = input.exp;
  let displayMaxExp = requiredExpToNext(input.level) ?? 0;
  if (input.level >= MAX_LEVEL) {
    const pts = pointsFromExp(input.paragonExp);
    if (pts >= PARAGON_TOTAL_CAP) {
      const last = paragonPointCost(PARAGON_TOTAL_CAP);
      displayExp = last;
      displayMaxExp = last;
    } else {
      displayExp = input.paragonExp - cumulativeExpForPoints(pts);
      displayMaxExp = paragonPointCost(pts + 1);
    }
  }

  const equippedSlots: EquippedSlots = {
    weapon: input.equipped.weapon,
    armor: input.equipped.armor,
    accessory: input.equipped.accessory,
  };

  const character: Character = {
    ...baseCharacter,
    name: input.name,
    gender: input.gender,
    titleName: input.titleName,
    hp: combat.player.hp,
    maxHp,
    level: input.level,
    exp: displayExp,
    maxExp: displayMaxExp,
    gold: input.gold,
    fame: input.fame,
    battleCount: input.battleCount,
    equipped: equippedSlots,
    stats: totalStats,
    skills: combat.characterSkills,
    affiliation: input.affiliation ?? baseCharacter.affiliation,
  };

  return {
    ...combat,
    character,
    equippedSlots,
  };
}
