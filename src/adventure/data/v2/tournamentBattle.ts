// v2 길드 3:3 토너먼트 — 왕좌 모드.
//
// 흐름: 첫 매치 A1 vs D1. 이긴 자가 남아서 진 측의 다음 멤버와 다음 매치.
// 진 자의 hp 는 다음 매치에서 회복 안 됨 — 연승할수록 약해짐. 성장욕구 충족 디자인.
//
// 종료: 한 측이 모든 멤버 (최대 3) 가 패배. 그 측이 짐.
// 최소 매치: 3 (한 측이 다 이김). 최대 매치: 5 (3:2 → 마지막 결정).
//
// 매치 sim 자체는 외부 주입 (`matchSim`) — 토너먼트 엔진은 순수.
// 테스트는 fake matchSim 으로 결정론 검증, 라우트는 resolveBattlePvP 래퍼 주입.

import type { PlayerCombat } from "../../v2/combat/engine";

export type TournamentMember = {
  userId: string;
  player: PlayerCombat;
  name: string;
};

export type TournamentMatch = {
  attackerName: string;
  defenderName: string;
  winnerSide: "attacker" | "defender";
  turns: number;
  // 살아남은 측의 hp (다음 매치로 이월).
  attackerHpEnd: number;
  defenderHpEnd: number;
};

export type TournamentResult = {
  matches: TournamentMatch[];
  attackerWon: boolean;
};

// 한 매치 sim — attacker/defender 단판, 결과 + 양측 잔여 hp.
// hp = 매치 시작 시점 hp (이월된 값). PlayerCombat.hp 가 이미 그 값.
export type MatchSim = (
  attacker: TournamentMember,
  defender: TournamentMember,
) => TournamentMatch;

// shallow clone — matchSim 이 mutating 이어도 원본 멤버 오염 방지.
function cloneMember(m: TournamentMember): TournamentMember {
  return { ...m, player: { ...m.player } };
}

export function simulateTournament(
  attackers: TournamentMember[],
  defenders: TournamentMember[],
  matchSim: MatchSim,
): TournamentResult {
  if (attackers.length === 0 || defenders.length === 0) {
    return { matches: [], attackerWon: attackers.length > 0 };
  }

  const matches: TournamentMatch[] = [];
  let aIdx = 0;
  let dIdx = 0;
  // 현재 매치에 들어가는 살아남은 멤버. 진입 시 clone — matchSim 이 mutate
  // 해도 원본 attackers/defenders 배열의 멤버 안전.
  let aCurrent = cloneMember(attackers[0]);
  let dCurrent = cloneMember(defenders[0]);

  while (aIdx < attackers.length && dIdx < defenders.length) {
    const match = matchSim(aCurrent, dCurrent);
    matches.push(match);

    if (match.winnerSide === "attacker") {
      // attacker 가 챔피언 — hp 갱신 후 남음.
      aCurrent = {
        ...aCurrent,
        player: { ...aCurrent.player, hp: match.attackerHpEnd },
      };
      dIdx += 1;
      if (dIdx < defenders.length) dCurrent = cloneMember(defenders[dIdx]);
    } else {
      dCurrent = {
        ...dCurrent,
        player: { ...dCurrent.player, hp: match.defenderHpEnd },
      };
      aIdx += 1;
      if (aIdx < attackers.length) aCurrent = cloneMember(attackers[aIdx]);
    }
  }

  // 종료 — 한 측의 모든 멤버 패배.
  // attackerWon = defender 측이 다 졌나 (dIdx 가 길이 도달)
  const attackerWon = dIdx >= defenders.length;
  return { matches, attackerWon };
}
