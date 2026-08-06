import { describe, expect, it } from "vitest";
import {
  ARENA_LOADOUT_MAX,
  arenaLoadoutIssueSummary,
  arenaPatternActionSummary,
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

describe("arenaPatternActionSummary — 실제 패턴 행동만 표시", () => {
  it("장착 액티브 목록 대신 스킬·역할 패턴을 우선순위대로 요약한다", () => {
    const pattern = {
      blocks: [
        {
          condition: { kind: "self_hp" as const, op: "below" as const, pct: 50 },
          action: {
            kind: "skill" as const,
            skillId: "v2c_extremesurvivor_struggle",
          },
        },
        {
          condition: { kind: "always" as const },
          action: { kind: "role" as const, role: "main_attack" as const },
        },
      ],
    };

    const loadout = mk("pattern-summary", {
      skills: [
        "v2c_shadow_assassinate",
        "v2c_phantom_ambush",
        "v2c_ironman_brace",
        "v2c_extremesurvivor_struggle",
      ],
      pattern,
    });

    expect(arenaPatternActionSummary(loadout)).toEqual([
      {
        key: "0:skill:v2c_extremesurvivor_struggle",
        name: "사투",
        condition: "내 HP 50% 이하",
      },
      {
        key: "1:role:main_attack",
        name: "주 공격",
        condition: "항상",
      },
    ]);
  });

  it("복합 조건과 내 버프 조건을 사용자 문구로 함께 표시한다", () => {
    const loadout = mk("condition-summary", {
      pattern: {
        blocks: [
          {
            condition: {
              kind: "all",
              conditions: [
                { kind: "self_hp", op: "below", pct: 35 },
                { kind: "self_buff", stat: "str", active: false },
                {
                  kind: "self_buff_pct",
                  target: "damageReduction",
                  active: true,
                },
              ],
            },
            action: { kind: "role", role: "buff" },
          },
        ],
      },
    });

    expect(arenaPatternActionSummary(loadout)[0]).toMatchObject({
      name: "버프",
      condition:
        "모두 만족 (내 HP 35% 이하 / 내 힘 버프 없음 / 내 받는 피해 감소 상태 효과 있음)",
    });
  });

  it("지속 회복과 확정 회피를 내 상태 효과 조건으로 표시한다", () => {
    const loadout = mk("status-effect-summary", {
      pattern: {
        blocks: [
          {
            condition: {
              kind: "self_buff_pct",
              target: "regen",
              active: false,
            },
            action: { kind: "role", role: "buff" },
          },
          {
            condition: {
              kind: "self_buff_pct",
              target: "guaranteedEvade",
              active: true,
            },
            action: { kind: "role", role: "main_attack" },
          },
        ],
      },
    });

    expect(arenaPatternActionSummary(loadout).map((row) => row.condition)).toEqual([
      "내 지속 회복 상태 효과 없음",
      "내 확정 회피 상태 효과 있음",
    ]);
  });

  it("패턴 미설정은 빈 목록으로 표시한다", () => {
    expect(arenaPatternActionSummary(mk("no-pattern"))).toEqual([]);
  });
});

describe("arenaLoadoutIssueSummary — 전투 적용 누락 경고", () => {
  it("빈 슬롯·사라진 장비와 사용자 패턴에서 빠진 액티브 스킬을 찾는다", () => {
    const loadout = mk("issues", {
      skills: [
        "v2c_shadow_assassinate",
        "v2c_ironman_brace",
        "v2c_extremesurvivor_struggle",
      ],
      equipment: { weapon: "owned", armor: "gone" },
      pattern: {
        blocks: [
          {
            condition: { kind: "always" },
            action: { kind: "role", role: "main_attack" },
          },
          {
            condition: { kind: "self_hp", op: "below", pct: 50 },
            action: { kind: "skill", skillId: "v2c_extremesurvivor_struggle" },
          },
        ],
      },
    });

    expect(arenaLoadoutIssueSummary(loadout, new Set(["owned"]))).toEqual({
      emptyEquipmentSlots: ["gloves", "boots", "ring", "necklace"],
      unavailableEquipmentSlots: ["armor"],
      uncoveredActiveSkills: [{ id: "v2c_ironman_brace", name: "버티기" }],
    });
  });

  it("기본 패턴은 장착 액티브 누락 경고를 만들지 않는다", () => {
    const loadout = mk("default", {
      skills: ["v2c_ironman_brace"],
      pattern: null,
    });
    expect(
      arenaLoadoutIssueSummary(loadout, new Set(["w1", "a1"]))
        .uncoveredActiveSkills,
    ).toEqual([]);
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
