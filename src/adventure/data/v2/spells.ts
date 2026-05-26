// v2 마법 데미지 스킬 풀.
//
// PR-7 변경:
//   - intMultiplier 1/3 인하 (codex 컨설팅 — 즉사 위험 해소).
//     기존: flame ×3 / bolt ×6 / meteor ×12 → 신: ×1 / ×2 / ×4
//   - 한 전투 1주문만 cast (큰 비용 순으로 첫 발동 가능한 것). 기존 sweep(가능한
//     만큼 다 발동) 폐기 — "한 번의 큰 burst" 컨셉으로 단순화.
//   - 턴당 액티브·cooldown 구조 전환은 PR-7b 후속 (engine 의 player turn 시작 hook
//     필요, 큰 변경).
//
// 단판 전투 모델: 전투 시작 시 MP 풀충전 → 큰 비용 순으로 첫 발동 가능한 1주문 cast →
// 그 후 일반 전투. MP 회복 없음 (전투 끝까지 잔량 보존, UI 표시용).
//
// 학습 임계: INT 5(flame) / 15(bolt) / 30(meteor). 라이브 캐릭은 INT 0 → 학습 X → no-op.

export type Spell = {
  id: SpellId;
  name: string;
  description: string;
  mpCost: number;
  /** 데미지 = INT × intMultiplier (1 하한). 마법은 회피 불가 (DEF 무시). */
  intMultiplier: number;
};

export type SpellId = "flame" | "bolt" | "meteor";

export const SPELLS: Record<SpellId, Spell> = {
  flame: {
    id: "flame",
    name: "불꽃",
    description: "기초 마법. 적은 MP 로 작은 화염 일격.",
    mpCost: 20,
    intMultiplier: 1,
  },
  bolt: {
    id: "bolt",
    name: "번개",
    description: "중급 마법. 적정 비용에 한 줄기 번개.",
    mpCost: 40,
    intMultiplier: 2,
  },
  meteor: {
    id: "meteor",
    name: "유성",
    description: "상급 마법. 큰 비용으로 떨어뜨리는 별빛 일격.",
    mpCost: 80,
    intMultiplier: 4,
  },
};

// 발동 우선순위 — 큰 비용/큰 데미지부터. PR-7: 한 전투 1주문만 cast.
export const SPELL_ORDER: readonly SpellId[] = ["meteor", "bolt", "flame"];

// INT 임계값 자동 학습. INT 가 임계값 이상이면 책 없이 자동 사용 가능.
// v2 베이스 INT = 0 → 시작 시 아무것도 학습 안 됨. 단련/장비로 INT 찍어 해금.
export const SPELL_LEARN_THRESHOLD: Record<SpellId, number> = {
  flame: 5,
  bolt: 15,
  meteor: 30,
};

// 학습 가능 마법 목록 — SPELL_ORDER 순(큰 것부터). UI/equip 정규화에 사용.
export function learnedSpellsForInt(intStat: number): SpellId[] {
  return SPELL_ORDER.filter((id) => intStat >= SPELL_LEARN_THRESHOLD[id]);
}

// 저장된 equippedSpells 를 학습 가능 목록·슬롯 cap 으로 정규화.
// - 알 수 없는 id 제거 / 학습 안 한 id 제거 / 중복 제거(앞 우선) / cap = slotCount
export function normalizeEquippedSpells(
  saved: unknown,
  intStat: number,
  slotCount: number,
): SpellId[] {
  const learnable = new Set(learnedSpellsForInt(intStat));
  if (!Array.isArray(saved)) return [];
  const out: SpellId[] = [];
  const seen = new Set<SpellId>();
  for (const v of saved) {
    if (typeof v !== "string") continue;
    const id = v as SpellId;
    if (!(id in SPELLS)) continue;
    if (!learnable.has(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= slotCount) break;
  }
  return out;
}

import type { BattleLogEntry, BattleState } from "@/adventure/battle/engine";
import type { PvPBattleState, PvPSide } from "@/adventure/battle/engine-pvp";

// 전투 시작 시 1주문 cast (PR-7) — 큰 비용 순으로 첫 발동 가능한 spell 1번만.
// 기존 sweep(MP 소진까지 반복)에서 한 발로 좁힘 — "burst" 컨셉.
// 마법은 회피 불가, DEF 무시 (1차).
//
// totalStats.int / maxMp 둘 다 0 인 라이브 캐릭은 no-op — state 그대로 반환.
export function applyStartOfBattleSpells(
  state: BattleState,
  intStat: number,
  equippedSpells: readonly SpellId[],
  playerName: string,
): BattleState {
  if (intStat <= 0 || state.playerMaxMp <= 0 || equippedSpells.length === 0) {
    return state;
  }
  const equippedSet = new Set(equippedSpells);
  for (const id of SPELL_ORDER) {
    if (!equippedSet.has(id)) continue;
    const spell = SPELLS[id];
    if (state.playerMp < spell.mpCost) continue;
    const damage = Math.max(1, intStat * spell.intMultiplier);
    const log: BattleLogEntry[] = [
      ...state.log,
      {
        kind: "player_attack",
        text: `${playerName}의 [${spell.name}] — ${damage} 마법 데미지 (MP -${spell.mpCost})`,
        turn: "player",
      },
    ];
    return {
      ...state,
      playerMp: state.playerMp - spell.mpCost,
      enemyHp: Math.max(0, state.enemyHp - damage),
      log,
    };
  }
  return state;
}

// PvP 시작 1주문 — 양측 동시 발동 (PR-7).
// 양측 cast 의사를 pre-state 기준으로 독립 계산 → 한 번에 적용. 선공/후공 영향 X,
// 동귀어진 가능 (양측 lethal). 로그는 firstSideKey 순서 (관습).
// 마법 단발화 의도 = "양측이 burst 1발씩 동시 발사". 라이브 호환: intStat 0/equipped 빈
// → 결정 0 → no-op.
export function applyStartOfBattleSpellsPvP(
  state: PvPBattleState,
  firstSideKey: "p1" | "p2",
): PvPBattleState {
  type CastIntent = {
    spellName: string;
    mpCost: number;
    damage: number;
  } | null;

  function pickCast(side: PvPSide): CastIntent {
    const intStat = side.player.intStat ?? 0;
    const equipped = side.player.equippedSpells ?? [];
    if (intStat <= 0 || side.maxMp <= 0 || equipped.length === 0) return null;
    const equippedSet = new Set(equipped);
    for (const id of SPELL_ORDER) {
      if (!equippedSet.has(id)) continue;
      const spell = SPELLS[id];
      if (side.mp < spell.mpCost) continue;
      return {
        spellName: spell.name,
        mpCost: spell.mpCost,
        damage: Math.max(1, intStat * spell.intMultiplier),
      };
    }
    return null;
  }

  // pre-state 기준 — 양측 의사 결정이 상대의 cast 결과에 영향받지 않음.
  const p1Cast = pickCast(state.p1);
  const p2Cast = pickCast(state.p2);

  const log: BattleLogEntry[] = [...state.log];
  // 로그는 선공 측 우선 순서 (관습).
  const order: ("p1" | "p2")[] =
    firstSideKey === "p1" ? ["p1", "p2"] : ["p2", "p1"];
  for (const sideTag of order) {
    const cast = sideTag === "p1" ? p1Cast : p2Cast;
    if (!cast) continue;
    const sideName = sideTag === "p1" ? state.p1.name : state.p2.name;
    log.push({
      kind: "player_attack",
      text: `${sideName}의 [${cast.spellName}] — ${cast.damage} 마법 데미지 (MP -${cast.mpCost})`,
      turn: "player",
      side: sideTag,
    });
  }

  // HP/MP 동시 적용. 양측 lethal 이면 둘 다 0 으로 → 동귀어진.
  const newP1 = {
    ...state.p1,
    mp: p1Cast ? state.p1.mp - p1Cast.mpCost : state.p1.mp,
    hp: p2Cast ? Math.max(0, state.p1.hp - p2Cast.damage) : state.p1.hp,
  };
  const newP2 = {
    ...state.p2,
    mp: p2Cast ? state.p2.mp - p2Cast.mpCost : state.p2.mp,
    hp: p1Cast ? Math.max(0, state.p2.hp - p1Cast.damage) : state.p2.hp,
  };

  return { ...state, p1: newP1, p2: newP2, log };
}
