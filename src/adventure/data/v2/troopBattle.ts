// v2 본 병사 전쟁 — PvP claim 에서 일기토 후속으로 발동.
//
// 흐름:
//   1. 영웅 일기토 (resolveBattlePvP) — 승패는 본 전쟁의 power 보정으로만 들어감.
//   2. 본 전쟁 — 양측 병사 power 비교 단판. 이쪽이 점령권 결정.
//
// design:
//   - 일기토 이긴 쪽 power × DUEL_BONUS, 진 쪽 power × DUEL_PENALTY.
//   - 노이즈 ±NOISE 로 일방적이지 않게. 너무 크면 sim 무의미라 작게.
//   - 사상자: 패자 LOSER_CASUALTY_RATE, 승자 WINNER_CASUALTY_RATE.
//   - 자원 약탈: 패자 stone × PLUNDER_RATE 승자에게.

export const DUEL_BONUS = 1.2; // 일기토 승자 power +20%
export const DUEL_PENALTY = 0.8; // 일기토 패자 power -20%

// 영웅 atk 가 power 에 살짝 기여 — 0병사 일방 무력화 방지 + 영웅 strength 미반영 문제 완화.
// 1 atk = 2 power. 만렙 영웅 atk ~80 ≈ 160 power ≈ 16 병사 가치.
export const ATK_TO_POWER = 2;
export const SOLDIER_TO_POWER = 10; // 1 병사 = 10 power. atk 와의 ratio 가 핵심 다이얼.

// 손실률 — 패자가 더 큰 손실. 일기토 보정 후 power ratio 가 클수록 손실 차이 커짐.
export const LOSER_CASUALTY_RATE = 0.6; // 패자 병사 60% 사상
export const WINNER_CASUALTY_RATE = 0.25; // 승자 병사 25% 사상

// 약탈 — 패자 stone 의 20% 승자에게. 0 이면 점령권만으로 끝나서 본 전쟁 의미 약함.
export const PLUNDER_RATE = 0.2;

export type TroopBattleInput = {
  attackerSoldiers: number;
  defenderSoldiers: number;
  attackerAtk: number;
  defenderAtk: number;
  attackerWonDuel: boolean;
  // 결정론 sim 회피용 노이즈 (0~1, 작게). 테스트는 0 으로 호출.
  noise?: number;
  // RNG 주입 — 테스트 결정론용. 미래 audit 위해 seeded 가능. default Math.random.
  rng?: () => number;
};

export type TroopBattleResult = {
  attackerWon: boolean;
  attackerPower: number;
  defenderPower: number;
  attackerCasualties: number; // 사상자 수 (>=0)
  defenderCasualties: number;
};

// 본 전쟁 단판 sim. 순수 함수.
export function simulateTroopBattle(input: TroopBattleInput): TroopBattleResult {
  const {
    attackerSoldiers,
    defenderSoldiers,
    attackerAtk,
    defenderAtk,
    attackerWonDuel,
    noise = 0,
    rng = Math.random,
  } = input;

  const aBase =
    Math.max(0, attackerSoldiers) * SOLDIER_TO_POWER +
    Math.max(0, attackerAtk) * ATK_TO_POWER;
  const dBase =
    Math.max(0, defenderSoldiers) * SOLDIER_TO_POWER +
    Math.max(0, defenderAtk) * ATK_TO_POWER;

  // 일기토 보정.
  const aMod = attackerWonDuel ? DUEL_BONUS : DUEL_PENALTY;
  const dMod = attackerWonDuel ? DUEL_PENALTY : DUEL_BONUS;

  // 노이즈는 양측 독립 ±NOISE 곱. noise=0 → 결정론.
  const aNoiseFactor = 1 + (rng() * 2 - 1) * noise;
  const dNoiseFactor = 1 + (rng() * 2 - 1) * noise;

  const aPower = aBase * aMod * aNoiseFactor;
  const dPower = dBase * dMod * dNoiseFactor;

  const attackerWon = aPower > dPower;

  // 사상자 — 양측 자기 병사 기준 비율. 영웅 자체는 안 죽음 (이미 일기토에서 처리).
  const attackerCasualties = Math.floor(
    Math.max(0, attackerSoldiers) *
      (attackerWon ? WINNER_CASUALTY_RATE : LOSER_CASUALTY_RATE),
  );
  const defenderCasualties = Math.floor(
    Math.max(0, defenderSoldiers) *
      (attackerWon ? LOSER_CASUALTY_RATE : WINNER_CASUALTY_RATE),
  );

  return {
    attackerWon,
    attackerPower: Math.round(aPower),
    defenderPower: Math.round(dPower),
    attackerCasualties,
    defenderCasualties,
  };
}

// 약탈 — 패자의 stone 일부 승자에게. 음수/0 보호.
export function computePlunder(loserStone: number): number {
  return Math.floor(Math.max(0, loserStone) * PLUNDER_RATE);
}
