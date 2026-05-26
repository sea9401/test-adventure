// v2 마법 데미지 스킬 풀 (PR-4) — 라이브 25종 AP 스킬 풀과 별개.
//
// 단판 전투 모델: 매 전투 시작 시 MP 풀충전(PR-3) → 학습한 마법 중 비용
// 큰 것부터 발동 가능한 만큼 차례로 자동 발동 → MP 다 떨어지면 끝.
//
// 1차 다이얼:
//   - 효율 통일: damage = INT × (cost / 6.66) ≈ MP 1 당 데미지 0.15×INT
//     (코드는 단순화 위해 다이얼 상수만 갖음)
//   - INT 10 = MP 100 → 유성(80) + 불꽃(20) 발동
//   - INT 20 = MP 200 → 유성 2번 + 불꽃 2번 ... (소진까지)
//
// 학습은 별도 시스템 없음 — INT > 0 인 모든 캐릭이 3종 다 사용 가능 (PR-5
// 에서 슬롯/장착으로 좁힐 가능성). 라이브 캐릭은 INT 0 → MP 0 → 자동 미발동.

export type Spell = {
  id: SpellId;
  name: string;
  description: string;
  mpCost: number;
  /** 데미지 = INT × intMultiplier (DEF 적용 후 1 하한). */
  intMultiplier: number;
};

export type SpellId = "flame" | "bolt" | "meteor";

export const SPELLS: Record<SpellId, Spell> = {
  flame: {
    id: "flame",
    name: "불꽃",
    description: "기초 마법. 적은 MP 로 작은 화염 일격.",
    mpCost: 20,
    intMultiplier: 3,
  },
  bolt: {
    id: "bolt",
    name: "번개",
    description: "중급 마법. 적정 비용에 한 줄기 번개.",
    mpCost: 40,
    intMultiplier: 6,
  },
  meteor: {
    id: "meteor",
    name: "유성",
    description: "상급 마법. 큰 비용으로 떨어뜨리는 별빛 일격.",
    mpCost: 80,
    intMultiplier: 12,
  },
};

// 발동 우선순위 — 큰 비용/큰 데미지부터. 한 전투 시작 1회 sweep 에서 가능한
// 만큼 차례로 발동.
export const SPELL_ORDER: readonly SpellId[] = ["meteor", "bolt", "flame"];

import type { BattleLogEntry, BattleState } from "@/adventure/battle/engine";
import type { PvPBattleState, PvPSide } from "@/adventure/battle/engine-pvp";

// 전투 시작 시 1회 sweep — 학습한 마법(현재는 SPELLS 전체) 중 비용 큰 것부터
// 가능한 만큼 발동. 적이 죽으면 sweep 중단. 마법 데미지는 DEF 무시 (1차).
//
// totalStats.int / maxMp 둘 다 0 인 라이브 캐릭은 no-op — state 그대로 반환.
export function applyStartOfBattleSpells(
  state: BattleState,
  intStat: number,
  playerName: string,
): BattleState {
  if (intStat <= 0 || state.playerMaxMp <= 0) return state;
  let mp = state.playerMp;
  let enemyHp = state.enemyHp;
  const log: BattleLogEntry[] = [...state.log];
  for (const id of SPELL_ORDER) {
    const spell = SPELLS[id];
    while (mp >= spell.mpCost && enemyHp > 0) {
      mp -= spell.mpCost;
      const damage = Math.max(1, intStat * spell.intMultiplier);
      enemyHp = Math.max(0, enemyHp - damage);
      log.push({
        kind: "player_attack",
        text: `${playerName}의 [${spell.name}] — ${damage} 마법 데미지 (MP -${spell.mpCost})`,
        turn: "player",
      });
    }
    if (enemyHp <= 0) break;
  }
  return { ...state, playerMp: mp, enemyHp, log };
}

// PvP 시작 sweep — 양측 동시 발동. 선공 측 우선 순서 (관습).
// 한쪽이 마법으로 죽으면 죽은 측은 sweep 중단(상대만 마저 발동 가능).
export function applyStartOfBattleSpellsPvP(
  state: PvPBattleState,
  firstSideKey: "p1" | "p2",
): PvPBattleState {
  const secondSideKey = firstSideKey === "p1" ? "p2" : "p1";
  const log: BattleLogEntry[] = [...state.log];
  let p1 = state.p1;
  let p2 = state.p2;

  function sweepSide(
    attacker: PvPSide,
    defender: PvPSide,
    attackerSideTag: "p1" | "p2",
  ): { attacker: PvPSide; defender: PvPSide } {
    const intStat = attacker.player.intStat ?? 0;
    if (intStat <= 0 || attacker.maxMp <= 0) return { attacker, defender };
    let mp = attacker.mp;
    let defHp = defender.hp;
    for (const id of SPELL_ORDER) {
      const spell = SPELLS[id];
      while (mp >= spell.mpCost && defHp > 0) {
        mp -= spell.mpCost;
        const damage = Math.max(1, intStat * spell.intMultiplier);
        defHp = Math.max(0, defHp - damage);
        log.push({
          kind: "player_attack",
          text: `${attacker.name}의 [${spell.name}] — ${damage} 마법 데미지 (MP -${spell.mpCost})`,
          turn: "player",
          side: attackerSideTag,
        });
      }
      if (defHp <= 0) break;
    }
    return { attacker: { ...attacker, mp }, defender: { ...defender, hp: defHp } };
  }

  // 선공 측 먼저.
  if (firstSideKey === "p1") {
    const r1 = sweepSide(p1, p2, "p1");
    p1 = r1.attacker;
    p2 = r1.defender;
    if (p2.hp > 0) {
      const r2 = sweepSide(p2, p1, "p2");
      p2 = r2.attacker;
      p1 = r2.defender;
    }
  } else {
    const r1 = sweepSide(p2, p1, "p2");
    p2 = r1.attacker;
    p1 = r1.defender;
    if (p1.hp > 0) {
      const r2 = sweepSide(p1, p2, "p1");
      p1 = r2.attacker;
      p2 = r2.defender;
    }
  }
  void secondSideKey;
  return { ...state, p1, p2, log };
}
