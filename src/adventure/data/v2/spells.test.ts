import { describe, it, expect } from "vitest";
import {
  SPELLS,
  SPELL_LEARN_THRESHOLD,
  castSpellsOnPlayerTurn,
  learnedSpellsForInt,
  normalizeEquippedSpells,
} from "./spells";
import type { BattleState, BattleLogEntry } from "@/adventure/battle/engine";

function mkState(over: Partial<BattleState> = {}): BattleState {
  return {
    enemy: { name: "허수아비", tags: [], hp: 100, atk: 1, def: 0, spd: 1, exp: 0 },
    enemyHp: 1000,
    playerHp: 100,
    playerMaxHp: 100,
    playerMp: 100,
    playerMaxMp: 100,
    log: [],
    phase: "player",
    outcome: null,
    playerAttacksLeft: 1,
    turn: {} as BattleState["turn"],
    flags: {} as BattleState["flags"],
    buffs: {} as BattleState["buffs"],
    stacks: {} as BattleState["stacks"],
    ap: 0,
    ...over,
  };
}

function spellLogs(log: readonly BattleLogEntry[]): string[] {
  return log
    .filter((e) => typeof e.text === "string" && /\[.+\]/.test(e.text))
    .map((e) => e.text as string);
}

describe("castSpellsOnPlayerTurn — 매 player turn 1발 cast", () => {
  it("INT 0 (라이브 캐릭) → no-op", () => {
    const before = mkState();
    const after = castSpellsOnPlayerTurn(before, 0, ["flame", "bolt", "meteor"], "용사");
    expect(after).toBe(before);
  });

  it("maxMp 0 → no-op", () => {
    const before = mkState({ playerMp: 0, playerMaxMp: 0 });
    const after = castSpellsOnPlayerTurn(before, 50, ["flame"], "용사");
    expect(after).toBe(before);
  });

  it("equippedSpells 빈 → no-op", () => {
    const before = mkState();
    const after = castSpellsOnPlayerTurn(before, 50, [], "용사");
    expect(after).toBe(before);
  });

  it("flame 장착, 첫 turn → flame cast (cd 0)", () => {
    // PR-T1 ×5: INT 50 × 0.2 = 10 (옛 INT 10 × 1 = 10 과 동등).
    const before = mkState({ playerMp: 100 });
    const after = castSpellsOnPlayerTurn(before, 50, ["flame"], "용사");
    expect(before.enemyHp - after.enemyHp).toBe(10);
    expect(after.playerMp).toBe(80);
    expect(after.spellCooldowns?.flame).toBe(0);
    expect(spellLogs(after.log).length).toBe(1);
  });

  it("meteor 장착, 첫 turn → meteor cast (cd 3 set)", () => {
    // PR-T1 ×5: INT 150 × 0.8 = 120 (옛 INT 30 × 4 = 120 과 동등).
    const before = mkState({ playerMp: 100 });
    const after = castSpellsOnPlayerTurn(before, 150, ["meteor"], "용사");
    expect(before.enemyHp - after.enemyHp).toBe(120);
    expect(after.playerMp).toBe(20);
    expect(after.spellCooldowns?.meteor).toBe(3);
  });

  it("두 번째 turn — cd 3 의 meteor 는 cast 못 함, cd 만 감소", () => {
    let s = mkState({ playerMp: 200 });
    s = castSpellsOnPlayerTurn(s, 150, ["meteor"], "용사");
    expect(s.spellCooldowns?.meteor).toBe(3);
    const after = castSpellsOnPlayerTurn(s, 150, ["meteor"], "용사");
    expect(after.spellCooldowns?.meteor).toBe(2);
    expect(after.playerMp).toBe(s.playerMp);
    expect(after.enemyHp).toBe(s.enemyHp);
  });

  it("3턴 후 cd 만료 → meteor 다시 cast", () => {
    let s = mkState({ playerMp: 500 });
    s = castSpellsOnPlayerTurn(s, 150, ["meteor"], "용사"); // cast cd=3
    s = castSpellsOnPlayerTurn(s, 150, ["meteor"], "용사"); // cd 3 → 2
    s = castSpellsOnPlayerTurn(s, 150, ["meteor"], "용사"); // cd 2 → 1
    s = castSpellsOnPlayerTurn(s, 150, ["meteor"], "용사"); // cd 1 → 0, cast cd=3
    expect(s.playerMp).toBe(500 - 160);
    expect(spellLogs(s.log).length).toBe(2);
  });

  it("meteor + flame 둘 다 → 큰 비용 우선 meteor, 다음 turn 은 cd 라 flame", () => {
    let s = mkState({ playerMp: 300 });
    s = castSpellsOnPlayerTurn(s, 150, ["meteor", "flame"], "용사");
    expect(s.spellCooldowns?.meteor).toBe(3);
    expect(s.playerMp).toBe(220);

    s = castSpellsOnPlayerTurn(s, 150, ["meteor", "flame"], "용사");
    expect(s.spellCooldowns?.meteor).toBe(2);
    expect(s.spellCooldowns?.flame).toBe(0);
    expect(s.playerMp).toBe(200);
  });

  it("MP 부족 → cd 만 감소, cast X", () => {
    let s = mkState({ playerMp: 10 });
    s = castSpellsOnPlayerTurn(s, 150, ["meteor", "flame"], "용사");
    expect(s.playerMp).toBe(10);
    expect(s.enemyHp).toBe(1000);
    expect(s.spellCooldowns?.meteor).toBe(0);
  });
});

describe("v2 spells — learnedSpellsForInt", () => {
  it("INT 임계 — flame=25, bolt=75, meteor=150 (PR-T1 ×5)", () => {
    expect(SPELL_LEARN_THRESHOLD).toEqual({ flame: 25, bolt: 75, meteor: 150 });
    expect(learnedSpellsForInt(0)).toEqual([]);
    expect(learnedSpellsForInt(25)).toEqual(["flame"]);
    expect(learnedSpellsForInt(74)).toEqual(["flame"]);
    expect(learnedSpellsForInt(75)).toEqual(["bolt", "flame"]);
    expect(learnedSpellsForInt(150)).toEqual(["meteor", "bolt", "flame"]);
  });
});

describe("v2 spells — normalizeEquippedSpells", () => {
  it("학습 안 한 / 중복 / 알 수 없는 id 제거 + 슬롯 cap", () => {
    expect(
      normalizeEquippedSpells(["meteor", "bolt", "flame"], 50, 3),
    ).toEqual(["flame"]);
    expect(
      normalizeEquippedSpells(["bolt", "flame", "flame", "junk"], 75, 3),
    ).toEqual(["bolt", "flame"]);
    expect(
      normalizeEquippedSpells(["meteor", "bolt", "flame"], 150, 2),
    ).toEqual(["meteor", "bolt"]);
    expect(normalizeEquippedSpells("not-array", 150, 3)).toEqual([]);
  });
});

describe("v2 spells — SPELLS 카탈로그 (PR-7b cooldown)", () => {
  it("3종 모두 정의 (flame/bolt/meteor)", () => {
    expect(Object.keys(SPELLS).sort()).toEqual(["bolt", "flame", "meteor"]);
  });

  it("intMultiplier — flame ×0.2, bolt ×0.4, meteor ×0.8 (PR-T1 ×5 스케일)", () => {
    expect(SPELLS.flame.intMultiplier).toBe(0.2);
    expect(SPELLS.bolt.intMultiplier).toBe(0.4);
    expect(SPELLS.meteor.intMultiplier).toBe(0.8);
  });

  it("cooldownPlayerTurns — flame 0, bolt 1, meteor 3 (PR-7b)", () => {
    expect(SPELLS.flame.cooldownPlayerTurns).toBe(0);
    expect(SPELLS.bolt.cooldownPlayerTurns).toBe(1);
    expect(SPELLS.meteor.cooldownPlayerTurns).toBe(3);
  });

  it("비용·데미지·cd 단조", () => {
    expect(SPELLS.flame.mpCost).toBeLessThan(SPELLS.bolt.mpCost);
    expect(SPELLS.bolt.mpCost).toBeLessThan(SPELLS.meteor.mpCost);
    expect(SPELLS.flame.intMultiplier).toBeLessThan(SPELLS.bolt.intMultiplier);
    expect(SPELLS.bolt.intMultiplier).toBeLessThan(SPELLS.meteor.intMultiplier);
    expect(SPELLS.flame.cooldownPlayerTurns).toBeLessThan(SPELLS.bolt.cooldownPlayerTurns);
    expect(SPELLS.bolt.cooldownPlayerTurns).toBeLessThan(SPELLS.meteor.cooldownPlayerTurns);
  });
});
