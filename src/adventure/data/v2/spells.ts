// v2 마법 데미지 스킬 풀.
//
// PR-7b: 턴당 액티브 + cooldown 패턴. 매 player turn 시작 시 가능한 spell 1발 cast.
//
// - intMultiplier (PR-7): flame ×1 / bolt ×2 / meteor ×4
// - cooldownPlayerTurns (PR-7b): flame 0 / bolt 1 / meteor 3
//   cast 직후 spellCooldowns[id] = cooldown 으로 set, 매 player turn 시작 시 -1.
//   0 이면 (또는 미설정이면) cast 가능. flame 은 cd 0 → MP 만 있으면 매 turn 가능.
//
// 흐름:
//   - 매 player turn 시작 시: ①cooldowns 감소 → ②가능한 spell 1발 cast → ③해당 cd set
//   - MP 회복 없음 (전투 끝까지 잔량 보존)
//   - 마법은 회피 불가 + DEF 무시
//
// 학습 임계: INT 5(flame) / 15(bolt) / 30(meteor). 라이브 캐릭은 INT 0 → no-op.

export type Spell = {
  id: SpellId;
  name: string;
  description: string;
  mpCost: number;
  /** 데미지 = INT × intMultiplier (1 하한). */
  intMultiplier: number;
  /** cast 직후 다음 cast 가능 turn 까지의 대기 (player turn 단위). 0 = 매 턴 가능. */
  cooldownPlayerTurns: number;
};

export type SpellId = "flame" | "bolt" | "meteor";

export const SPELLS: Record<SpellId, Spell> = {
  flame: {
    id: "flame",
    name: "불꽃",
    description: "기초 마법. 적은 MP 로 작은 화염 일격.",
    mpCost: 20,
    intMultiplier: 1,
    cooldownPlayerTurns: 0,
  },
  bolt: {
    id: "bolt",
    name: "번개",
    description: "중급 마법. 적정 비용에 한 줄기 번개.",
    mpCost: 40,
    intMultiplier: 2,
    cooldownPlayerTurns: 1,
  },
  meteor: {
    id: "meteor",
    name: "유성",
    description: "상급 마법. 큰 비용으로 떨어뜨리는 별빛 일격.",
    mpCost: 80,
    intMultiplier: 4,
    cooldownPlayerTurns: 3,
  },
};

// 발동 우선순위 — 큰 비용/큰 데미지부터. 매 turn cast 시 이 순서로 첫 가능한 spell pick.
export const SPELL_ORDER: readonly SpellId[] = ["meteor", "bolt", "flame"];

// INT 임계값 자동 학습. INT 가 임계값 이상이면 자동 사용 가능.
// v2 베이스 INT = 0 → 시작 시 아무것도 학습 안 됨.
export const SPELL_LEARN_THRESHOLD: Record<SpellId, number> = {
  flame: 5,
  bolt: 15,
  meteor: 30,
};

export function learnedSpellsForInt(intStat: number): SpellId[] {
  return SPELL_ORDER.filter((id) => intStat >= SPELL_LEARN_THRESHOLD[id]);
}

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

export type SpellCooldowns = Partial<Record<SpellId, number>>;

// 매 player turn 시작 시 호출 — cooldown 감소 + 1발 cast + 해당 cd set.
// totalStats.int / maxMp 둘 다 0 인 라이브 캐릭은 no-op (state 그대로).
//
// 흐름:
//   1) 모든 cooldowns 의 카운터 -1 (0 클램프)
//   2) SPELL_ORDER 순으로 첫 cast 가능한 spell pick:
//      - equipped 안에 있어야 함
//      - mp 충분
//      - (감소 후) cooldown <= 0
//   3) cast: damage = INT × intMultiplier, enemyHp 차감, mp 차감, log push,
//      해당 cooldown = spell.cooldownPlayerTurns 로 set
//
// cd 감소만 일어나고 cast 안 되는 경우도 정상 (mp 부족·cd 안 끝남) — state 갱신은
// cooldowns 변화만 반영. 가독성·테스트 위해 cooldowns 는 항상 새 객체 반환.
export function castSpellsOnPlayerTurn(
  state: BattleState,
  intStat: number,
  equippedSpells: readonly SpellId[],
  playerName: string,
): BattleState {
  if (intStat <= 0 || state.playerMaxMp <= 0 || equippedSpells.length === 0) {
    return state;
  }

  // 1) cooldowns 감소
  const prevCooldowns = state.spellCooldowns ?? {};
  const cooldowns: SpellCooldowns = {};
  for (const id of SPELL_ORDER) {
    const prev = prevCooldowns[id] ?? 0;
    cooldowns[id] = Math.max(0, prev - 1);
  }

  // 2) cast 후보 pick
  const equippedSet = new Set(equippedSpells);
  for (const id of SPELL_ORDER) {
    if (!equippedSet.has(id)) continue;
    const spell = SPELLS[id];
    if (state.playerMp < spell.mpCost) continue;
    if ((cooldowns[id] ?? 0) > 0) continue;
    // 3) cast
    const damage = Math.max(1, intStat * spell.intMultiplier);
    const log: BattleLogEntry[] = [
      ...state.log,
      {
        kind: "player_attack",
        text: `${playerName}의 [${spell.name}] — ${damage} 마법 데미지 (MP -${spell.mpCost})`,
        turn: "player",
      },
    ];
    cooldowns[id] = spell.cooldownPlayerTurns;
    return {
      ...state,
      playerMp: state.playerMp - spell.mpCost,
      enemyHp: Math.max(0, state.enemyHp - damage),
      log,
      spellCooldowns: cooldowns,
    };
  }

  // cd 만 감소
  return { ...state, spellCooldowns: cooldowns };
}

// PvP 시작 1주문 — 양측 동시 발동 (PR-7 에서 도입한 단발 burst 패턴 유지).
// PR-7b 의 턴당 액티브 전환은 PvE 만. PvP 는 PR-7c 후속에서 통일.
// 양측 cast 의사를 pre-state 기준으로 독립 계산 → 한 번에 적용. 양측 lethal 시
// 동귀어진. 로그는 firstSideKey 순서 (관습). 라이브 호환: intStat 0/equipped 빈 → no-op.
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

  const p1Cast = pickCast(state.p1);
  const p2Cast = pickCast(state.p2);

  const log: BattleLogEntry[] = [...state.log];
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
