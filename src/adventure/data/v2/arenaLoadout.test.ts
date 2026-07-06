import { describe, expect, it } from "vitest";
import {
  ARENA_LOADOUT_MAX,
  parseArenaLoadouts,
  parseActiveArenaLoadout,
  serializeActiveArenaLoadout,
  loadoutSkillsForApply,
  loadoutEquipmentForApply,
  type ArenaLoadout,
} from "./arenaLoadout";
import type { V2SkillId } from "./v2Skills";

const mk = (id: string, over: Partial<ArenaLoadout> = {}): ArenaLoadout => ({
  id,
  name: `세팅${id}`,
  savedAt: "2026-06-08T00:00:00.000Z",
  skills: ["a", "b"] as unknown as V2SkillId[],
  pattern: null,
  element: "fire",
  equipment: { weapon: "w1", armor: "a1" },
  ...over,
});

describe("parseArenaLoadouts (방어적 파싱)", () => {
  it("배열 아님 → []", () => {
    expect(parseArenaLoadouts(null)).toEqual([]);
    expect(parseArenaLoadouts({ loadouts: [] })).toEqual([]);
  });

  it("id/name 없는 엔트리는 버리고, skills/equipment 타입 거름", () => {
    const parsed = parseArenaLoadouts([
      mk("ok"),
      { name: "no id" },
      { id: "no name" },
      {
        id: "dirty",
        name: "더티",
        skills: ["x", 3, null, "y"], // 문자열만 유지
        equipment: { weapon: "w", bogus: "z", armor: 5 }, // 유효 슬롯+문자열만
      },
    ]);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]!.id).toBe("ok");
    expect(parsed[0]!.element).toBe("fire");
    expect(parsed[1]!.skills).toEqual(["x", "y"]);
    expect(parsed[1]!.equipment).toEqual({ weapon: "w" }); // armor=5 거름·bogus 슬롯 거름
  });

  it("MAX 로 자른다", () => {
    const big = Array.from({ length: ARENA_LOADOUT_MAX + 4 }, (_, i) => mk(`l${i}`));
    expect(parseArenaLoadouts(big)).toHaveLength(ARENA_LOADOUT_MAX);
  });
});

describe("active arena loadout", () => {
  it("목록 첫 항목을 활성 템플릿으로 읽는다", () => {
    expect(parseActiveArenaLoadout([mk("first"), mk("second")])?.id).toBe(
      "first",
    );
  });

  it("단일 활성 템플릿 저장 형태는 배열 1개다", () => {
    expect(serializeActiveArenaLoadout(mk("active"))).toHaveLength(1);
    expect(serializeActiveArenaLoadout(null)).toEqual([]);
  });
});

describe("loadoutSkillsForApply — learned 인 스킬만(순서 보존)", () => {
  it("미보유 스킬 제외 + 순서 유지", () => {
    const lo = mk("x", { skills: ["c", "a", "b", "z"] as unknown as V2SkillId[] });
    const learned = ["a", "b", "c"] as unknown as V2SkillId[];
    expect(loadoutSkillsForApply(lo, learned)).toEqual(["c", "a", "b"]); // z 제외, 저장 순서
  });
});

describe("loadoutEquipmentForApply — 보유(iid) 슬롯만", () => {
  it("판/분해로 사라진 iid 는 건너뜀", () => {
    const lo = mk("x", { equipment: { weapon: "w1", armor: "gone", ring: "r1" } });
    const owned = new Set(["w1", "r1"]);
    expect(loadoutEquipmentForApply(lo, owned)).toEqual({ weapon: "w1", ring: "r1" });
  });
});
