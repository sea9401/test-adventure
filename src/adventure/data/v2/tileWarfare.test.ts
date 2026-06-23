import { describe, expect, it } from "vitest";
import { OUTPOSTS, OUTPOST_BY_ID } from "./outposts";
import { computeNextAttackAt } from "./npcAttack";
import { FORT_MAX_HP, POST_CAPTURE_PROTECT_MS } from "./outpostSiege";
import { tileSettlementName } from "./tileConfig";
import {
  buildTileOccupationValues,
  isKnownOutpostId,
  isTileAdjacentToNeutralOutpost,
  isTileOutpostId,
  NEUTRAL_TILE_OUTPOST_CELLS,
  outpostDisplayName,
  parseTileOutpostId,
  resolveOutpostMeta,
  synthTileOutpost,
  tileOutpostId,
  tileTierToOutpostTier,
} from "./tileWarfare";

describe("tile id 헬퍼", () => {
  it("tileOutpostId ↔ parseTileOutpostId 라운드트립", () => {
    expect(tileOutpostId(3, 5)).toBe("tile:3,5");
    expect(parseTileOutpostId("tile:3,5")).toEqual({ col: 3, row: 5 });
    expect(parseTileOutpostId(tileOutpostId(0, 8))).toEqual({ col: 0, row: 8 });
  });

  it("isTileOutpostId — tile id true, 카탈로그 id false", () => {
    expect(isTileOutpostId("tile:1,1")).toBe(true);
    expect(isTileOutpostId("neutral_haven_central")).toBe(false);
    expect(isTileOutpostId("war_central_fort")).toBe(false);
  });

  it("parseTileOutpostId — 카탈로그/손상 id 는 null", () => {
    expect(parseTileOutpostId("neutral_haven_central")).toBeNull();
    expect(parseTileOutpostId("tile:")).toBeNull();
    expect(parseTileOutpostId("tile:3")).toBeNull();
    expect(parseTileOutpostId("tile:a,b")).toBeNull();
  });
});

describe("outpostDisplayName — id → 표시 이름", () => {
  it("카탈로그 거점 — 카탈로그 name", () => {
    const cat = OUTPOSTS[0];
    expect(outpostDisplayName(cat.id)).toBe(cat.name);
  });

  it("타일 거점 — 좌표 결정적 이름(지도/DB 와 일치)", () => {
    expect(outpostDisplayName("tile:3,5")).toBe(tileSettlementName(3, 5));
    // 원시 tile id 가 그대로 노출되지 않음.
    expect(outpostDisplayName("tile:3,5")).not.toContain("tile:");
  });

  it("미해석 id — 원시 id 폴백", () => {
    expect(outpostDisplayName("nonexistent_xyz")).toBe("nonexistent_xyz");
  });
});

describe("tileTierToOutpostTier — 단조 매핑", () => {
  it("frontier→1, village→2, city→3, metropolis→4", () => {
    expect(tileTierToOutpostTier("frontier")).toBe(1);
    expect(tileTierToOutpostTier("village")).toBe(2);
    expect(tileTierToOutpostTier("city")).toBe(3);
    expect(tileTierToOutpostTier("metropolis")).toBe(4);
  });
});

describe("synthTileOutpost", () => {
  it("정착지 → village형 합성 Outpost", () => {
    const o = synthTileOutpost(3, 5, "city");
    expect(o.id).toBe("tile:3,5");
    expect(o.type).toBe("village");
    expect(o.tier).toBe(3);
    expect(o.neutral).toBe(false);
    expect(typeof o.name).toBe("string");
    // position 은 맵 경계 안.
    expect(o.position.x).toBeGreaterThanOrEqual(0);
    expect(o.position.x).toBeLessThanOrEqual(10000);
    expect(o.position.y).toBeGreaterThanOrEqual(0);
    expect(o.position.y).toBeLessThanOrEqual(6000);
  });

  it("name override 우선, 없으면 결정적 기본 이름", () => {
    expect(synthTileOutpost(3, 5, "village", "내정착지").name).toBe("내정착지");
    expect(synthTileOutpost(3, 5, "village").name).toBe(
      synthTileOutpost(3, 5, "metropolis").name, // 이름은 좌표 결정적(티어 무관)
    );
  });
});

describe("resolveOutpostMeta", () => {
  it("카탈로그 id = OUTPOST_BY_ID.get 와 동일 참조(byte-identical)", () => {
    for (const o of OUTPOSTS) {
      expect(resolveOutpostMeta(o.id)).toBe(OUTPOST_BY_ID.get(o.id));
      // 기존 OUTPOSTS.find 패턴과도 동치.
      expect(resolveOutpostMeta(o.id)).toBe(
        OUTPOSTS.find((x) => x.id === o.id),
      );
    }
  });

  it("미존재 카탈로그 id → undefined (.find/.get 시맨틱 보존)", () => {
    expect(resolveOutpostMeta("does_not_exist")).toBeUndefined();
  });

  it("tile id + tile 인자 → 합성, 인자 없으면 undefined", () => {
    expect(resolveOutpostMeta("tile:2,2")).toBeUndefined();
    const o = resolveOutpostMeta("tile:2,2", { tier: "village" });
    expect(o?.id).toBe("tile:2,2");
    expect(o?.tier).toBe(2);
  });
});

describe("buildTileOccupationValues", () => {
  const NOW = 1_700_000_000_000;

  it("길드 점령행 값 — claim 패턴 미러(공성/세율 동일)", () => {
    const v = buildTileOccupationValues({
      userId: "u1",
      guildId: 42,
      col: 3,
      row: 5,
      tier: "village",
      now: NOW,
    });
    expect(v.outpostId).toBe("tile:3,5");
    expect(v.occupiedByUserId).toBe("u1");
    expect(v.occupiedByGuildId).toBe(42);
    expect(v.policy).toBe("open");
    expect(v.taxRate).toBe("0.100");
    expect(v.fortHp).toBe(FORT_MAX_HP);
    expect(v.fortMaxHp).toBe(FORT_MAX_HP);
    expect(v.fortUpdatedAt.getTime()).toBe(NOW);
    expect(v.protectedUntil.getTime()).toBe(NOW + POST_CAPTURE_PROTECT_MS);
  });

  it("nextAttackAt 은 tier 매핑 기반 computeNextAttackAt (frontier→1, city→3)", () => {
    const frontier = buildTileOccupationValues({
      userId: "u1",
      guildId: 1,
      col: 0,
      row: 0,
      tier: "frontier",
      now: NOW,
    });
    expect(frontier.nextAttackAt.getTime()).toBe(
      computeNextAttackAt(1, NOW).getTime(),
    );
    const city = buildTileOccupationValues({
      userId: "u1",
      guildId: 1,
      col: 1,
      row: 1,
      tier: "city",
      now: NOW,
    });
    expect(city.nextAttackAt.getTime()).toBe(
      computeNextAttackAt(3, NOW).getTime(),
    );
  });
});

describe("중립 거점 인접(영토 PvP 부트스트랩)", () => {
  it("NEUTRAL_TILE_OUTPOST_CELLS — 보드 위 중립 거점(리베라 4,4) 포함", () => {
    expect(NEUTRAL_TILE_OUTPOST_CELLS).toContainEqual({ col: 4, row: 4 });
    // 중립 거점만(현재 리베라 하나).
    expect(NEUTRAL_TILE_OUTPOST_CELLS.length).toBeGreaterThanOrEqual(1);
  });

  it("isTileAdjacentToNeutralOutpost — 리베라 상하좌우 4칸만 true", () => {
    // 4방향 인접.
    for (const [c, r] of [
      [3, 4],
      [5, 4],
      [4, 3],
      [4, 5],
    ]) {
      expect(isTileAdjacentToNeutralOutpost(c, r)).toBe(true);
    }
    // 자기 자신·대각선·원거리 = false.
    expect(isTileAdjacentToNeutralOutpost(4, 4)).toBe(false);
    expect(isTileAdjacentToNeutralOutpost(3, 3)).toBe(false);
    expect(isTileAdjacentToNeutralOutpost(0, 0)).toBe(false);
  });
});

describe("isKnownOutpostId", () => {
  it("카탈로그 거점·tile id true, 미존재 false", () => {
    expect(isKnownOutpostId("neutral_haven_central")).toBe(true);
    expect(isKnownOutpostId("tile:9,9")).toBe(true);
    expect(isKnownOutpostId("nope")).toBe(false);
  });

  it("모든 카탈로그 id 에 대해 OUTPOST_BY_ID.has 와 일치", () => {
    for (const o of OUTPOSTS) {
      expect(isKnownOutpostId(o.id)).toBe(OUTPOST_BY_ID.has(o.id));
    }
  });
});
