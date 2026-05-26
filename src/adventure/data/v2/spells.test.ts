import { describe, it, expect } from "vitest";
import {
  SPELLS,
  SPELL_LEARN_THRESHOLD,
  applyStartOfBattleSpells,
  learnedSpellsForInt,
  normalizeEquippedSpells,
} from "./spells";
import type { BattleState } from "@/adventure/battle/engine";

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

describe("v2 spells — applyStartOfBattleSpells (PR-7: 1주문만 cast)", () => {
  it("INT 0 은 발동 X (라이브 캐릭)", () => {
    const before = mkState();
    const after = applyStartOfBattleSpells(before, 0, ["meteor", "bolt", "flame"], "용사");
    expect(after).toBe(before);
  });

  it("maxMp 0 은 발동 X", () => {
    const before = mkState({ playerMp: 0, playerMaxMp: 0 });
    const after = applyStartOfBattleSpells(before, 10, ["meteor", "bolt", "flame"], "용사");
    expect(after).toBe(before);
  });

  it("INT 10, MP 100 + 모든 마법 장착 → meteor 한 발만 (큰 비용 우선)", () => {
    const before = mkState({ playerMp: 100, playerMaxMp: 100 });
    const after = applyStartOfBattleSpells(before, 10, ["meteor", "bolt", "flame"], "용사");
    // meteor = INT 10 × 4 = 40 데미지, MP -80
    expect(before.enemyHp - after.enemyHp).toBe(40);
    expect(after.playerMp).toBe(20);
    const spellLogs = after.log.filter((e) => e.text?.includes("[유성]"));
    expect(spellLogs.length).toBe(1);
    // bolt/flame 은 cast 안 됨
    expect(after.log.filter((e) => e.text?.includes("[번개]")).length).toBe(0);
    expect(after.log.filter((e) => e.text?.includes("[불꽃]")).length).toBe(0);
  });

  it("MP 부족하면 큰 비용 마법 스킵, 다음 가능한 spell 1발", () => {
    // MP 50 → meteor(80) 스킵, bolt(40) cast
    const before = mkState({ playerMp: 50, playerMaxMp: 50 });
    const after = applyStartOfBattleSpells(before, 10, ["meteor", "bolt", "flame"], "용사");
    // bolt = INT 10 × 2 = 20, MP -40
    expect(before.enemyHp - after.enemyHp).toBe(20);
    expect(after.playerMp).toBe(10);
    expect(after.log.filter((e) => e.text?.includes("[번개]")).length).toBe(1);
  });

  it("MP 10 < flame(20) → 아무것도 cast X", () => {
    const before = mkState({ playerMp: 10, playerMaxMp: 10 });
    const after = applyStartOfBattleSpells(before, 10, ["meteor", "bolt", "flame"], "용사");
    expect(after).toBe(before);
  });

  it("flame 만 장착 → flame 한 발 (작은 burst)", () => {
    const before = mkState({ playerMp: 100, playerMaxMp: 100 });
    const after = applyStartOfBattleSpells(before, 10, ["flame"], "용사");
    // flame = INT 10 × 1 = 10 데미지, MP -20
    expect(before.enemyHp - after.enemyHp).toBe(10);
    expect(after.playerMp).toBe(80);
    expect(after.log.filter((e) => e.text?.includes("[불꽃]")).length).toBe(1);
  });

  it("INT 0 보호 — intMultiplier 단조라 INT 큰 캐릭은 더 강함", () => {
    const before = mkState({ playerMp: 100, playerMaxMp: 100, enemyHp: 10000 });
    const small = applyStartOfBattleSpells(before, 10, ["meteor"], "용사");
    const large = applyStartOfBattleSpells(before, 100, ["meteor"], "용사");
    expect(before.enemyHp - small.enemyHp).toBe(40); // 10 × 4
    expect(before.enemyHp - large.enemyHp).toBe(400); // 100 × 4
  });
});

describe("v2 spells — equippedSpells 필터", () => {
  it("장착 안 한 마법은 cast X", () => {
    const before = mkState({ playerMp: 100, playerMaxMp: 100 });
    const after = applyStartOfBattleSpells(before, 30, ["bolt"], "용사");
    // bolt 만 장착 — meteor 학습됐어도 cast 안 됨
    expect(after.log.filter((e) => e.text?.includes("[번개]")).length).toBe(1);
    expect(after.log.filter((e) => e.text?.includes("[유성]")).length).toBe(0);
  });

  it("빈 배열이면 cast X", () => {
    const before = mkState({ playerMp: 100, playerMaxMp: 100 });
    const after = applyStartOfBattleSpells(before, 10, [], "용사");
    expect(after).toBe(before);
  });
});

describe("v2 spells — learnedSpellsForInt", () => {
  it("INT 임계 — flame=5, bolt=15, meteor=30", () => {
    expect(SPELL_LEARN_THRESHOLD).toEqual({ flame: 5, bolt: 15, meteor: 30 });
    expect(learnedSpellsForInt(0)).toEqual([]);
    expect(learnedSpellsForInt(5)).toEqual(["flame"]);
    expect(learnedSpellsForInt(14)).toEqual(["flame"]);
    expect(learnedSpellsForInt(15)).toEqual(["bolt", "flame"]);
    expect(learnedSpellsForInt(30)).toEqual(["meteor", "bolt", "flame"]);
  });
});

describe("v2 spells — normalizeEquippedSpells", () => {
  it("학습 안 한 / 중복 / 알 수 없는 id 제거 + 슬롯 cap", () => {
    expect(
      normalizeEquippedSpells(["meteor", "bolt", "flame"], 10, 3),
    ).toEqual(["flame"]); // INT 10 은 flame 만 학습
    expect(
      normalizeEquippedSpells(["bolt", "flame", "flame", "junk"], 15, 3),
    ).toEqual(["bolt", "flame"]);
    expect(
      normalizeEquippedSpells(["meteor", "bolt", "flame"], 30, 2),
    ).toEqual(["meteor", "bolt"]);
    expect(normalizeEquippedSpells("not-array", 30, 3)).toEqual([]);
  });
});

describe("v2 spells — SPELLS 카탈로그 (PR-7 계수 1/3)", () => {
  it("3종 모두 정의 (flame/bolt/meteor)", () => {
    expect(Object.keys(SPELLS).sort()).toEqual(["bolt", "flame", "meteor"]);
  });

  it("PR-7 계수 — flame ×1, bolt ×2, meteor ×4 (이전 ×3/×6/×12 의 1/3)", () => {
    expect(SPELLS.flame.intMultiplier).toBe(1);
    expect(SPELLS.bolt.intMultiplier).toBe(2);
    expect(SPELLS.meteor.intMultiplier).toBe(4);
  });

  it("비용·데미지 단조 (큰 비용 = 큰 데미지)", () => {
    expect(SPELLS.flame.mpCost).toBeLessThan(SPELLS.bolt.mpCost);
    expect(SPELLS.bolt.mpCost).toBeLessThan(SPELLS.meteor.mpCost);
    expect(SPELLS.flame.intMultiplier).toBeLessThan(SPELLS.bolt.intMultiplier);
    expect(SPELLS.bolt.intMultiplier).toBeLessThan(SPELLS.meteor.intMultiplier);
  });
});
