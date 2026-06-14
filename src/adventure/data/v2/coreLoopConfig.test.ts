import { describe, it, expect } from "vitest";
import {
  JOB_GROUP_STAT_GATE,
  SPEC_STAT_GATE,
  isStatGateMet,
  unlockedJobGroups,
  unlockedSpecs,
  V2_CORE_LOOP_V2,
  HUNT_COOLDOWN_MS,
  LOOP_BATTLES_TARGET,
  V2_LEVEL_CAP,
  OFFLINE_MAX_BATTLES,
} from "./coreLoopConfig";
import { V2_JOB_SPECS } from "./v2JobSpecs";
import { V2_SELECTABLE_CLASSES } from "./classes";

const ALL_SPEC_IDS = Object.values(V2_JOB_SPECS)
  .flat()
  .map((s) => s.id);

describe("coreLoopConfig — 스탯게이트 테이블 동기화", () => {
  it("플래그는 기본 off (미완성 시스템)", () => {
    expect(V2_CORE_LOOP_V2).toBe(false);
  });

  it("선택 가능한 4직군 전부 JOB_GROUP_STAT_GATE 등록", () => {
    for (const c of V2_SELECTABLE_CLASSES) {
      expect(JOB_GROUP_STAT_GATE[c], c).toBeDefined();
    }
    expect(Object.keys(JOB_GROUP_STAT_GATE).sort()).toEqual(
      [...V2_SELECTABLE_CLASSES].sort(),
    );
  });

  it("실재 12계파 전부 SPEC_STAT_GATE 등록 + 고아 키 없음", () => {
    expect(ALL_SPEC_IDS).toHaveLength(12);
    for (const id of ALL_SPEC_IDS) {
      expect(SPEC_STAT_GATE[id], id).toBeDefined();
    }
    expect(Object.keys(SPEC_STAT_GATE).sort()).toEqual([...ALL_SPEC_IDS].sort());
  });

  it("각 게이트는 비어있지 않고 양수 임계", () => {
    for (const gate of [
      ...Object.values(JOB_GROUP_STAT_GATE),
      ...Object.values(SPEC_STAT_GATE),
    ]) {
      const entries = Object.entries(gate);
      expect(entries.length).toBeGreaterThan(0);
      for (const [, min] of entries) expect(min).toBeGreaterThan(0);
    }
  });
});

describe("coreLoopConfig — predicate", () => {
  it("isStatGateMet — 모든 임계 충족 시만 true", () => {
    expect(isStatGateMet({ str: 40, vit: 50 }, { str: 40, vit: 50 })).toBe(true);
    expect(isStatGateMet({ str: 40, vit: 50 }, { str: 40, vit: 49 })).toBe(
      false,
    );
    expect(isStatGateMet({}, {})).toBe(true); // 빈 게이트
    expect(isStatGateMet({ str: 30 }, {})).toBe(false); // 스탯 없음=0
  });

  it("unlockedJobGroups — 주스탯으로 해금", () => {
    expect(unlockedJobGroups({ str: 30 })).toEqual(["warrior"]);
    expect(unlockedJobGroups({ str: 10 })).toEqual([]);
    expect(unlockedJobGroups({ str: 30, int: 30 }).sort()).toEqual([
      "mage",
      "warrior",
    ]);
  });

  it("unlockedSpecs — 복합 조건 충족 계파만", () => {
    // 기사(str40·vit50) 충족이지만 광검(str55·dex25) 미충족.
    const r = unlockedSpecs({ str: 40, vit: 50, dex: 0 });
    expect(r).toContain("knight");
    expect(r).not.toContain("gwang");
    // 아무 스탯 없으면 0.
    expect(unlockedSpecs({})).toEqual([]);
  });
});

describe("coreLoopConfig — 페이싱 다이얼 정합", () => {
  it("5초 × 1200판 ≈ 100분 루프", () => {
    const loopMinutes = (LOOP_BATTLES_TARGET * HUNT_COOLDOWN_MS) / 60000;
    expect(loopMinutes).toBeGreaterThanOrEqual(90);
    expect(loopMinutes).toBeLessThanOrEqual(120);
  });

  it("핵심 다이얼 양수/sane", () => {
    expect(HUNT_COOLDOWN_MS).toBe(5000);
    expect(V2_LEVEL_CAP).toBe(50);
    expect(OFFLINE_MAX_BATTLES).toBeGreaterThan(0);
  });
});
