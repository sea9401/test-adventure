import { describe, expect, it } from "vitest";
import { groupBattleLogEntries, lastHpBarIndex } from "./BattleLogList";
import { ATB_LOG_WINDOW_TICKS } from "../v2/combat/combatTimeline";
import type { BattleLogEntry } from "../v2/combat/engine";

// 전투 로그 박스 그룹화 — PvP 는 "턴 단위"(공격 주체 전환), PvE 는 turn_marker 단위.
//   핵심 회귀: PvP 가 hp_bar 마다(=행동 단위) 쪼개지지 않고, 한 턴의 멀티공격이 한 박스에 모인다.

const hp = (pHp: number, eHp: number): BattleLogEntry => ({
  kind: "hp_bar",
  text: "",
  playerHp: pHp,
  playerMaxHp: 100,
  enemyHp: eHp,
  enemyMaxHp: 100,
});

describe("groupBattleLogEntries — PvP(턴 단위)", () => {
  // 매 행동 뒤 hp_bar 가 붙는 PvP 로그. 한 턴에 멀티공격 2타 → 한 박스에 모여야 한다.
  const pvp: BattleLogEntry[] = [
    { kind: "info", text: "두 모험가가 마주섰다" }, // 시작 전 — 첫 턴 박스에 흡수
    { kind: "player_attack", text: "강타! 10 피해", turn: "player" },
    hp(100, 90),
    { kind: "player_attack", text: "강타! 8 피해", turn: "player" }, // 멀티공격 2타(같은 턴)
    hp(100, 82),
    { kind: "enemy_attack", text: "반격! 12 피해", turn: "enemy" }, // 턴 전환 → 새 박스
    hp(88, 82),
    { kind: "player_attack", text: "마무리! 9 피해", turn: "player" }, // 턴 전환 → 새 박스
    { kind: "info", text: "상대를 쓰러뜨렸다.", turn: "player" },
    hp(88, 0),
  ];

  it("턴 전환마다 박스가 나뉜다(행동마다 아님)", () => {
    const groups = groupBattleLogEntries(pvp);
    expect(groups.length).toBe(3);
  });

  it("한 턴의 멀티공격·hp_bar 가 한 박스에 모인다", () => {
    const groups = groupBattleLogEntries(pvp);
    // 첫 박스 = 오프닝 info + 같은 턴 공격 2타 + 각 hp_bar = 5
    expect(groups[0].length).toBe(5);
    const attacks = groups[0].filter((e) => e.kind === "player_attack");
    expect(attacks.length).toBe(2);
  });

  it("hp_bar 가 단독 박스를 만들지 않는다", () => {
    const groups = groupBattleLogEntries(pvp);
    for (const g of groups) {
      const onlyHpBar = g.every((e) => e.kind === "hp_bar");
      expect(onlyHpBar).toBe(false);
    }
  });
});

describe("groupBattleLogEntries — PvE(turn_marker 단위, 불변)", () => {
  const pve: BattleLogEntry[] = [
    { kind: "info", text: "들개가 나타났다" }, // 시작 전 별도 박스
    { kind: "turn_marker", text: "1턴" },
    { kind: "player_attack", text: "공격! 5 피해", turn: "player" },
    hp(100, 95),
    { kind: "turn_marker", text: "2턴" },
    { kind: "player_attack", text: "공격! 6 피해", turn: "player" },
    hp(100, 89),
  ];

  it("turn_marker 가 그룹 헤더 — 시작 전 entries 는 별도 박스", () => {
    const groups = groupBattleLogEntries(pve);
    expect(groups.length).toBe(3); // [info] / [1턴…] / [2턴…]
    expect(groups[0]).toEqual([{ kind: "info", text: "들개가 나타났다" }]);
    expect(groups[1][0]).toMatchObject({ kind: "turn_marker", text: "1턴" });
    expect(groups[2][0]).toMatchObject({ kind: "turn_marker", text: "2턴" });
  });
});

describe("groupBattleLogEntries — ATB(틱 윈도우 단위)", () => {
  const W = ATB_LOG_WINDOW_TICKS;
  const hpt = (pHp: number, eHp: number, t: number): BattleLogEntry => ({
    ...hp(pHp, eHp),
    t,
  });

  // 같은 윈도우(버킷 0)의 플레이어·적 행동이 한 박스에 모이고, 다음 윈도우는 새 박스.
  const atb: BattleLogEntry[] = [
    { kind: "info", text: "적이 나타났다" }, // 틱 없음 — 첫 박스에 흡수
    { kind: "player_attack", text: "a 10 피해", turn: "player", t: 0 },
    hpt(100, 90, 0),
    { kind: "enemy_attack", text: "b 8 피해", turn: "enemy", t: W - 1 }, // 같은 버킷 0
    hpt(92, 90, W - 1),
    { kind: "player_attack", text: "c 9 피해", turn: "player", t: W }, // 버킷 1 → 새 박스
    hpt(92, 81, W),
    { kind: "player_attack", text: "d 9 피해", turn: "player", t: W + 50 }, // 버킷 1
    hpt(92, 72, W + 50),
  ];

  it("틱이 있으면 윈도우 단위로 묶는다(행동자 전환 아님)", () => {
    const groups = groupBattleLogEntries(atb);
    expect(groups.length).toBe(2); // 버킷 0, 버킷 1
  });

  it("한 윈도우의 플레이어·적 행동이 한 박스에 모인다", () => {
    const [box0, box1] = groupBattleLogEntries(atb);
    // 박스0 = 오프닝 info + 공격 2(player·enemy) + hp_bar 2 = 5
    expect(box0.length).toBe(5);
    expect(box0.some((e) => e.kind === "player_attack")).toBe(true);
    expect(box0.some((e) => e.kind === "enemy_attack")).toBe(true);
    // 박스1 = 공격 2 + hp_bar 2 = 4
    expect(box1.length).toBe(4);
  });

  it("틱 없는 오프닝 info 는 첫 박스에 흡수(단독 박스 아님)", () => {
    const groups = groupBattleLogEntries(atb);
    expect(groups[0][0]).toMatchObject({ kind: "info", text: "적이 나타났다" });
    expect(groups[0].length).toBeGreaterThan(1);
  });

  // 회귀(Codex): DoT 가 전투를 끝낼 때 사망/DoT 엔트리가 t 를 못 받으면 최종 hp_bar 만 새 버킷이
  //   돼 "외톨이 hp_bar 박스"가 생겼다. 엔진이 그 엔트리들을 최종 hp_bar 와 같은 틱으로 스탬프 →
  //   한 박스에 모여야 한다.
  it("DoT 사망 — 사망/DoT/최종 hp_bar 가 같은 틱이면 한 박스(외톨이 hp_bar 아님)", () => {
    const t = W * 2;
    const log: BattleLogEntry[] = [
      { kind: "info", text: "적이 나타났다" },
      { kind: "player_attack", text: "공격 30 피해", turn: "player", t: 0 },
      hpt(70, 50, 0),
      // 다음 윈도우: 플레이어 DoT 가 발동해 전투 종료 — 모두 같은 틱 t 로 스탬프됨(엔진 fix).
      { kind: "enemy_attack", text: "[출혈] 70 피해를 입었다.", turn: "player", t },
      { kind: "info", text: "플레이어가 쓰러졌다.", turn: "player", t },
      hpt(0, 50, t),
    ];
    const groups = groupBattleLogEntries(log);
    const last = groups[groups.length - 1];
    // 마지막 박스에 DoT 피해 + 사망 info + hp_bar 가 함께(외톨이 hp_bar 아님).
    expect(last.filter((e) => e.kind === "hp_bar").length).toBe(1);
    expect(last.length).toBeGreaterThan(1);
    expect(last.some((e) => e.text.includes("쓰러졌다"))).toBe(true);
    // 어떤 박스도 hp_bar 단독이 아니어야 한다.
    for (const g of groups) {
      expect(g.every((e) => e.kind === "hp_bar")).toBe(false);
    }
  });
});

describe("lastHpBarIndex — 박스당 마지막 HP 바만 렌더", () => {
  it("여러 hp_bar 중 마지막 인덱스만 반환", () => {
    const group: BattleLogEntry[] = [
      { kind: "player_attack", text: "a", turn: "player" },
      hp(100, 90),
      { kind: "player_attack", text: "b", turn: "player" },
      hp(100, 80),
    ];
    expect(lastHpBarIndex(group)).toBe(3);
  });

  it("hp_bar 없으면 -1", () => {
    const group: BattleLogEntry[] = [
      { kind: "player_attack", text: "a", turn: "player" },
    ];
    expect(lastHpBarIndex(group)).toBe(-1);
  });
});

describe("groupBattleLogEntries — 빈/단일", () => {
  it("빈 배열 → 빈 그룹", () => {
    expect(groupBattleLogEntries([])).toEqual([]);
  });
});
