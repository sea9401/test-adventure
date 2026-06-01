import { describe, it, expect } from "vitest";
import {
  countDiscoveredFish,
  discoveredFishIds,
  emptyFishCodex,
  parseFishCodex,
  recordCatch,
} from "./fishingCodex";

describe("낚시 도감 — recordCatch", () => {
  it("신규 어종을 등록", () => {
    const codex = recordCatch(emptyFishCodex(), "crucian_carp", 22.5, 1000);
    const e = codex.fish.crucian_carp;
    expect(e.discovered).toBe(true);
    expect(e.bestSize).toBe(22.5);
    expect(e.totalCaught).toBe(1);
    expect(e.firstCaughtAt).toBe(1000);
    expect(e.bestCaughtAt).toBe(1000);
  });

  it("더 큰 사이즈면 최대어·시각 갱신, 마리 수 증가", () => {
    let codex = recordCatch(emptyFishCodex(), "carp", 40, 1000);
    codex = recordCatch(codex, "carp", 80, 2000);
    const e = codex.fish.carp;
    expect(e.bestSize).toBe(80);
    expect(e.bestCaughtAt).toBe(2000);
    expect(e.totalCaught).toBe(2);
    expect(e.firstCaughtAt).toBe(1000);
  });

  it("더 작은 사이즈면 최대어 유지, 마리 수만 증가", () => {
    let codex = recordCatch(emptyFishCodex(), "carp", 80, 1000);
    codex = recordCatch(codex, "carp", 30, 2000);
    const e = codex.fish.carp;
    expect(e.bestSize).toBe(80);
    expect(e.bestCaughtAt).toBe(1000);
    expect(e.totalCaught).toBe(2);
  });

  it("순수 함수 — 입력 코덱스를 변형하지 않음", () => {
    const base = emptyFishCodex();
    recordCatch(base, "trout", 50, 1000);
    expect(base.fish.trout).toBeUndefined();
  });
});

describe("낚시 도감 — parse / count", () => {
  it("손상된 입력은 빈 도감", () => {
    expect(parseFishCodex(null).fish).toEqual({});
    expect(parseFishCodex(42).fish).toEqual({});
    expect(parseFishCodex("nope").fish).toEqual({});
  });

  it("알 수 없는 어종 id 는 버린다", () => {
    const parsed = parseFishCodex({
      fish: {
        carp: { discovered: true, bestSize: 50, totalCaught: 1 },
        not_a_fish: { discovered: true, bestSize: 999, totalCaught: 1 },
      },
    });
    expect(parsed.fish.carp).toBeDefined();
    expect(parsed.fish.not_a_fish).toBeUndefined();
  });

  it("평면 형태({id: entry})도 수용", () => {
    const parsed = parseFishCodex({
      trout: { discovered: true, bestSize: 60, totalCaught: 3 },
    });
    expect(parsed.fish.trout?.bestSize).toBe(60);
  });

  it("discovered 누락 옛 데이터도 기록(>0)이면 발견 처리", () => {
    const parsed = parseFishCodex({ fish: { pike: { bestSize: 120, totalCaught: 2 } } });
    expect(parsed.fish.pike?.discovered).toBe(true);
  });

  it("기록 없는 미발견 엔트리는 버린다", () => {
    const parsed = parseFishCodex({
      fish: { goby: { discovered: false, bestSize: 0, totalCaught: 0 } },
    });
    expect(parsed.fish.goby).toBeUndefined();
  });

  it("discoveredFishIds / countDiscoveredFish", () => {
    let codex = emptyFishCodex();
    codex = recordCatch(codex, "carp", 50, 1);
    codex = recordCatch(codex, "trout", 40, 2);
    expect(countDiscoveredFish(codex)).toBe(2);
    expect(discoveredFishIds(codex).sort()).toEqual(["carp", "trout"]);
  });
});
