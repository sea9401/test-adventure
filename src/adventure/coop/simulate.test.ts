// 협동 보스 시뮬 턴 카운터 회귀 — attackCount>=2 인 캐릭터로도 정해진 턴수가 전부 돌아가는지.
//
// 회귀 배경: 예전엔 turnsRun 을 "phase===player 면 +1" 로 셌는데, advanceTurn 은 공격 한 번마다
// 호출되고 다중공격 중간 공격도 phase=player 로 리턴해서 사실상 "공격 횟수" 를 캡으로 잡았다.
// 본타 2회 캐릭터는 ~10 사이클, 3회면 ~7 사이클만 돌고 잘렸다.
// 현재는 engine 의 completedPlayerTurns 로 잰다.
//
// 실행: npm test -- src/adventure/coop/simulate.test.ts

import { describe, expect, it } from "vitest";
import { simulateCoopAttack } from "./simulate";
import type { BattleLogEntry, PlayerCombat } from "@/adventure/v2/combat/engine";

// 충분히 약해서 보스 hp 를 깎지 못하고, 보스 데미지가 약해서 죽지도 않는 더미 캐릭터.
// "캡까지 전부 도는지" 만 본다.
function dummyPlayer(attackCount: number): PlayerCombat {
  return {
    hp: 9999,
    maxHp: 9999,
    atk: 1,
    def: 9999, // 보스 공격을 거의 다 막아 turns 캡 전에 죽지 않게.
    spd: 0,
    evasionPct: 0,
    attackCount,
    extraAttackChancePct: 0,
    critChancePct: 0,
  };
}

function countTurnMarkers(log: BattleLogEntry[]): number {
  return log.filter((e) => e.kind === "turn_marker").length;
}

describe("simulateCoopAttack — turn cap regression", () => {
  it("attackCount=2 인 캐릭터도 turns=20 을 전부 돈다", () => {
    // 시뮬은 hp 매우 큰 보스를 가정 — 처치/사망 없이 캡까지 도달해야 본 버그를 잡는다.
    const r = simulateCoopAttack({
      player: dummyPlayer(2),
      playerName: "TestRunner",
      bossName: "운봉의 거인",
      bossCurrentHp: 5_000_000,
      bossMaxHp: 5_000_000,
      turns: 20,
    });

    // 죽지도, 잡지도 않았다 — 캡으로 종료.
    expect(r.diedEarly).toBe(false);
    expect(r.finalPlayerHp).toBeGreaterThan(0);

    // turn_marker: 시뮬 시작 시 "1턴" 1개 + cycleEnded 마다 하나 더 (2턴, 3턴, ...).
    // 본 버그가 살아있으면 (공격 횟수 캡 ≈ 10 cycle) marker 가 11개 정도에서 끊긴다.
    // 캡이 사이클 기반이면 turns 만큼 (혹은 turns+1 만큼) 찍힌다 — 최소 18 이상이면 통과.
    const markers = countTurnMarkers(r.log);
    expect(markers).toBeGreaterThanOrEqual(18);
  });

  it("attackCount=3 도 동일", () => {
    const r = simulateCoopAttack({
      player: dummyPlayer(3),
      playerName: "TestRunner",
      bossName: "운봉의 거인",
      bossCurrentHp: 5_000_000,
      bossMaxHp: 5_000_000,
      turns: 20,
    });
    expect(r.diedEarly).toBe(false);
    expect(countTurnMarkers(r.log)).toBeGreaterThanOrEqual(18);
  });

  it("attackCount=1 (회귀 전 정상 케이스) 도 동일하게 작동", () => {
    const r = simulateCoopAttack({
      player: dummyPlayer(1),
      playerName: "TestRunner",
      bossName: "운봉의 거인",
      bossCurrentHp: 5_000_000,
      bossMaxHp: 5_000_000,
      turns: 20,
    });
    expect(r.diedEarly).toBe(false);
    expect(countTurnMarkers(r.log)).toBeGreaterThanOrEqual(18);
  });
});
