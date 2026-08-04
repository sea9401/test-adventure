import { describe, expect, it } from "vitest";
import {
  battleCountOf,
  frontierDepthOf,
  huntGateSections,
  isRecordedJobVisit,
  elementalSkillsSection,
  materialCodexSection,
  proficiencySection,
  spFruitSection,
  tilePosOf,
} from "./stateSections";
import { MAX_FRONTIER_DEPTH } from "@/adventure/data/v2/dungeon";
import { V2_SKILLS, spCostOf } from "@/adventure/data/v2/v2Skills";

describe("battleCountOf", () => {
  it("monster kills 합 + 패배수 (랭킹 battleCount 와 동일 정의)", () => {
    expect(
      battleCountOf({
        monsters: { 늑대: { kills: 3 }, 골렘: { kills: 2 } },
        battleLosses: 4,
      }),
    ).toBe(9);
  });

  it("빈/손상 로그는 0", () => {
    expect(battleCountOf(null)).toBe(0);
    expect(battleCountOf(undefined)).toBe(0);
    expect(battleCountOf({})).toBe(0);
  });
});

describe("frontierDepthOf", () => {
  it("기본 2, 레거시 초과 깊이는 MAX 캡으로 정규화", () => {
    expect(frontierDepthOf(undefined)).toBe(2);
    expect(frontierDepthOf(0)).toBe(2);
    expect(frontierDepthOf(7)).toBe(7);
    expect(frontierDepthOf(9999)).toBe(MAX_FRONTIER_DEPTH);
  });
});

describe("tilePosOf", () => {
  it("col/row 숫자일 때만 좌표, at 은 있을 때만 동봉", () => {
    expect(tilePosOf(undefined)).toBeNull();
    expect(tilePosOf({ col: 1 })).toBeNull();
    expect(tilePosOf({ col: 1, row: 2 })).toEqual({ col: 1, row: 2 });
    expect(tilePosOf({ col: 1, row: 2, at: 5 })).toEqual({
      col: 1,
      row: 2,
      at: 5,
    });
  });
});

describe("spFruitSection / materialCodexSection", () => {
  it("빈 세이브에서 0 기반 형태를 돌려준다", () => {
    const fruit = spFruitSection(undefined);
    expect(fruit.capBonus).toBe(0);
    const codex = materialCodexSection(undefined);
    expect(codex.discovered).toBe(0);
    expect(codex.discoveredIds).toEqual([]);
    expect(codex.total).toBeGreaterThan(0);
  });
});

describe("huntGateSections", () => {
  it("스태미나 모드(테스트 env: HUNT_COOLDOWN_MODE off) — 쿨다운/오프라인 전부 null", () => {
    const gate = huntGateSections({ lastBattleAt: Date.now() }, Date.now());
    expect(gate.combatCooldown).toBeNull();
    expect(gate.offlinePending).toBeNull();
    expect(gate.offlineHunt).toBeNull();
  });
});

describe("proficiencySection", () => {
  it("빈 세이브 스모크 — 응답 shape(groups/caps/current) 유지", () => {
    const s = proficiencySection(undefined, { class: "warrior" });
    expect(s.groups).toBeDefined();
    expect(s.current.group).toBe("warrior");
    expect(typeof s.current.points).toBe("number");
    expect(typeof s.current.cumLevel).toBe("number");
    // 코어루프 off(테스트 env)면 레거시 advance 객체가 노출된다(정점 전 직군).
    for (const k of ["str", "dex", "int"]) {
      expect(typeof s.caps[k]).toBe("number");
    }
  });

  it("사냥 숙련도가 높아도 표시 한계치는 기본 60 + 수행 이득만 반영한다", () => {
    const s = proficiencySection(
      {
        groups: {
          warrior: { cultivations: 0, tier: 1, cumLevel: 1800 },
        },
        caps: { str: 10 },
      },
      { class: "warrior" },
    );

    expect(s.caps.str).toBe(70);
    expect(s.caps.dex).toBe(60);
  });
});

describe("elementalSkillsSection", () => {
  it("학습 전에도 학습 숙달 비용과 장착 SP 비용을 함께 제공한다", () => {
    const rows = elementalSkillsSection(
      { class: "warrior", specChoice: null },
      { learned: [], equipped: [] },
    );

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.learned).toBe(false);
      expect(row.cost).toBeGreaterThan(0);
      expect(row.spCost).toBe(spCostOf(V2_SKILLS[row.skillId]));
    }
  });
});

describe("isRecordedJobVisit", () => {
  it("현재 직업·전직 이력·숙련도 기록을 실제 전직 이력으로 보완한다", () => {
    const history = new Set(["squire"]);
    expect(
      isRecordedJobVisit({
        jobId: "warrior",
        currentJobId: "warrior",
        jobHistory: history,
        cumLevel: 0,
      }),
    ).toBe(true);
    expect(
      isRecordedJobVisit({
        jobId: "squire",
        currentJobId: "warrior",
        jobHistory: history,
        cumLevel: 0,
      }),
    ).toBe(true);
    expect(
      isRecordedJobVisit({
        jobId: "paladin",
        currentJobId: "warrior",
        jobHistory: new Set(),
        cumLevel: 120,
      }),
    ).toBe(true);
    expect(
      isRecordedJobVisit({
        jobId: "mage",
        currentJobId: "warrior",
        jobHistory: history,
        cumLevel: 0,
      }),
    ).toBe(false);
  });
});
