import { describe, it, expect } from "vitest";
import {
  simulateTournament,
  type TournamentMember,
  type MatchSim,
  type TournamentMatch,
} from "./tournamentBattle";
import type { PlayerCombat } from "../../battle/engine";

function makeMember(name: string, atk = 80, hp = 1000): TournamentMember {
  return {
    userId: `u-${name}`,
    name,
    player: {
      atk,
      def: 50,
      spd: 12,
      hp,
      maxHp: hp,
      extraHitsPct: 0,
      critPct: 0,
    } as unknown as PlayerCombat,
  };
}

// 결과를 결정짓는 fake sim — atk 큰 쪽이 이긴다. hp 손실은 = 상대 atk.
function atkBasedSim(...names: string[]): MatchSim {
  // names 는 사용 안 함 — 단순 lambda 가 더 깔끔하지만 readability 위해.
  return (a, d): TournamentMatch => {
    const winnerSide: "attacker" | "defender" =
      a.player.atk >= d.player.atk ? "attacker" : "defender";
    return {
      attackerName: a.name,
      defenderName: d.name,
      winnerSide,
      turns: 10,
      // 승자 hp 는 상대 atk 만큼 깎이고, 패자는 0
      attackerHpEnd:
        winnerSide === "attacker" ? Math.max(0, a.player.hp - d.player.atk) : 0,
      defenderHpEnd:
        winnerSide === "defender" ? Math.max(0, d.player.hp - a.player.atk) : 0,
    };
  };
}

describe("3:3 토너먼트 (왕좌 모드)", () => {
  it("공격자 전원이 압도 — 매치 3, attacker 승", () => {
    const attackers = [
      makeMember("A1", 100),
      makeMember("A2", 100),
      makeMember("A3", 100),
    ];
    const defenders = [
      makeMember("D1", 50),
      makeMember("D2", 50),
      makeMember("D3", 50),
    ];
    const result = simulateTournament(attackers, defenders, atkBasedSim());
    expect(result.attackerWon).toBe(true);
    expect(result.matches).toHaveLength(3);
    // 매치 1: A1 vs D1, 2: A1 vs D2, 3: A1 vs D3 — A1 이 챔피언 유지
    expect(result.matches[0].attackerName).toBe("A1");
    expect(result.matches[0].defenderName).toBe("D1");
    expect(result.matches[1].defenderName).toBe("D2");
    expect(result.matches[2].defenderName).toBe("D3");
    // A1 의 hp 는 매치마다 깎임 — 마지막 매치 시작 hp 가 더 적어야
    expect(result.matches[2].attackerHpEnd).toBeLessThan(
      result.matches[0].attackerHpEnd,
    );
  });

  it("수비자 전원이 압도 — 매치 3, defender 승 (도전자 갈아탐)", () => {
    const attackers = [
      makeMember("A1", 50),
      makeMember("A2", 50),
      makeMember("A3", 50),
    ];
    const defenders = [
      makeMember("D1", 100),
      makeMember("D2", 100),
      makeMember("D3", 100),
    ];
    const result = simulateTournament(attackers, defenders, atkBasedSim());
    expect(result.attackerWon).toBe(false);
    expect(result.matches).toHaveLength(3);
    // D1 챔피언 유지, 도전자는 A1 → A2 → A3
    expect(result.matches[0].attackerName).toBe("A1");
    expect(result.matches[1].attackerName).toBe("A2");
    expect(result.matches[2].attackerName).toBe("A3");
    expect(result.matches[0].defenderName).toBe("D1");
    expect(result.matches[1].defenderName).toBe("D1");
    expect(result.matches[2].defenderName).toBe("D1");
  });

  it("교차 승리 — A1 격파 후 D1 도 격파 (5매치 시나리오)", () => {
    // 의도된 시나리오 위한 fake sim — 매치 순번에 따라 결과 직접 지정.
    const expectedSequence: ("attacker" | "defender")[] = [
      "defender", // m1: A1 vs D1 → D1 승
      "attacker", // m2: A2 vs D1 → A2 승 (D1 hp 가 적어서)
      "defender", // m3: A2 vs D2 → D2 승
      "attacker", // m4: A3 vs D2 → A3 승
      "attacker", // m5: A3 vs D3 → A3 승
    ];
    let idx = 0;
    const sim: MatchSim = (a, d) => ({
      attackerName: a.name,
      defenderName: d.name,
      winnerSide: expectedSequence[idx++],
      turns: 10,
      attackerHpEnd: 100,
      defenderHpEnd: 100,
    });
    const attackers = [
      makeMember("A1"),
      makeMember("A2"),
      makeMember("A3"),
    ];
    const defenders = [
      makeMember("D1"),
      makeMember("D2"),
      makeMember("D3"),
    ];
    const result = simulateTournament(attackers, defenders, sim);
    expect(result.matches).toHaveLength(5);
    expect(result.attackerWon).toBe(true);
    // 매치 1: A1 vs D1 (D1 챔피언으로 시작)
    expect(result.matches[0].attackerName).toBe("A1");
    expect(result.matches[0].defenderName).toBe("D1");
    // 매치 2: A2 (새 도전자) vs D1 (남음)
    expect(result.matches[1].attackerName).toBe("A2");
    expect(result.matches[1].defenderName).toBe("D1");
    // 매치 3: A2 (남음) vs D2 (새)
    expect(result.matches[2].attackerName).toBe("A2");
    expect(result.matches[2].defenderName).toBe("D2");
    // 매치 4: A3 vs D2
    expect(result.matches[3].attackerName).toBe("A3");
    expect(result.matches[3].defenderName).toBe("D2");
    // 매치 5: A3 vs D3
    expect(result.matches[4].attackerName).toBe("A3");
    expect(result.matches[4].defenderName).toBe("D3");
  });

  it("hp 이월 — 같은 챔피언의 hp 는 매치마다 감소", () => {
    const attackers = [makeMember("A1", 100, 1000)];
    const defenders = [
      makeMember("D1", 30, 100),
      makeMember("D2", 30, 100),
      makeMember("D3", 30, 100),
    ];
    const result = simulateTournament(attackers, defenders, atkBasedSim());
    expect(result.attackerWon).toBe(true);
    expect(result.matches).toHaveLength(3);
    // A1 hp = 1000 → 970 → 940 → 910 (각 매치마다 -30)
    expect(result.matches[0].attackerHpEnd).toBe(970);
    expect(result.matches[1].attackerHpEnd).toBe(940);
    expect(result.matches[2].attackerHpEnd).toBe(910);
  });

  it("빈 라인업 방어", () => {
    const r1 = simulateTournament(
      [],
      [makeMember("D1")],
      atkBasedSim(),
    );
    expect(r1.attackerWon).toBe(false);
    expect(r1.matches).toHaveLength(0);

    const r2 = simulateTournament(
      [makeMember("A1")],
      [],
      atkBasedSim(),
    );
    expect(r2.attackerWon).toBe(true);
    expect(r2.matches).toHaveLength(0);
  });

  it("1v3 시나리오 — 한 명 vs 세 명, 한 명이 다 격파", () => {
    const attackers = [makeMember("A1", 100, 1000)];
    const defenders = [
      makeMember("D1", 30, 100),
      makeMember("D2", 30, 100),
      makeMember("D3", 30, 100),
    ];
    const result = simulateTournament(attackers, defenders, atkBasedSim());
    expect(result.attackerWon).toBe(true);
    expect(result.matches).toHaveLength(3);
  });

  it("3v1 시나리오 — 라인업 비대칭", () => {
    const attackers = [
      makeMember("A1", 30, 100),
      makeMember("A2", 30, 100),
      makeMember("A3", 30, 100),
    ];
    const defenders = [makeMember("D1", 100, 1000)];
    const result = simulateTournament(attackers, defenders, atkBasedSim());
    expect(result.attackerWon).toBe(false);
    expect(result.matches).toHaveLength(3);
  });
});
