import { describe, expect, it } from "vitest";
import {
  BOT_TEMPLATES,
  buildBot,
  buildBotsAroundLevel,
} from "./arenaBots";

describe("buildBot", () => {
  it("레벨 1 봇은 스탯 분배 없음 — base + 장비 없음", () => {
    const bot = buildBot(BOT_TEMPLATES[0], 1);
    expect(bot.level).toBe(1);
    expect(bot.combat.player.maxHp).toBeGreaterThan(0);
  });

  it("레벨 50 봇의 focus 스탯이 가장 큰 분배를 가짐", () => {
    const t = BOT_TEMPLATES.find((x) => x.focus === "str")!;
    const bot = buildBot(t, 50);
    const stats = bot.combat.totalStats;
    expect(stats.str).toBeGreaterThan(stats.dex);
    expect(stats.str).toBeGreaterThan(stats.luk);
  });

  it("INT 봇은 임계값 이상이면 마법 학습", () => {
    const intBot = BOT_TEMPLATES.find((x) => x.focus === "int")!;
    const bot = buildBot(intBot, 50); // ~30 INT → meteor 까지 학습
    expect(bot.equippedSpells.length).toBeGreaterThan(0);
    expect(bot.combat.totalStats.int).toBeGreaterThanOrEqual(5);
  });

  it("STR 봇은 INT 낮아 마법 학습 X", () => {
    const strBot = BOT_TEMPLATES.find((x) => x.focus === "str")!;
    const bot = buildBot(strBot, 30);
    expect(bot.combat.totalStats.int).toBe(0);
    expect(bot.equippedSpells.length).toBe(0);
  });

  it("음수·0 레벨은 1 로 클램프", () => {
    const bot = buildBot(BOT_TEMPLATES[0], 0);
    expect(bot.level).toBe(1);
    const botNeg = buildBot(BOT_TEMPLATES[0], -5);
    expect(botNeg.level).toBe(1);
  });

  it("id 는 템플릿 id + 레벨 접미사", () => {
    const bot = buildBot(BOT_TEMPLATES[0], 42);
    expect(bot.id).toMatch(/-l42$/);
  });

  it("봇 score 는 항상 0 — 매칭 가중치 동등", () => {
    const bot = buildBot(BOT_TEMPLATES[0], 50);
    expect(bot.score).toBe(0);
  });
});

describe("buildBotsAroundLevel", () => {
  it("템플릿 수 × 3 변종 (low/mid/high) 보다 작거나 같음 (dedupe 가능)", () => {
    const bots = buildBotsAroundLevel(10, 5);
    expect(bots.length).toBeLessThanOrEqual(BOT_TEMPLATES.length * 3);
    expect(bots.length).toBeGreaterThan(0);
  });

  it("playerLevel ±band 범위 안 레벨만 생성", () => {
    const bots = buildBotsAroundLevel(20, 5);
    for (const b of bots) {
      expect(b.level).toBeGreaterThanOrEqual(15);
      expect(b.level).toBeLessThanOrEqual(25);
    }
  });

  it("저레벨 클램프 — band 가 1 미만으로 내려가면 1 로", () => {
    const bots = buildBotsAroundLevel(2, 5);
    for (const b of bots) {
      expect(b.level).toBeGreaterThanOrEqual(1);
    }
  });
});
