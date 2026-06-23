import { describe, it, expect } from "vitest";
import { resolveMonsterArchetype } from "./archetypes";
import { scaleMonsterForFloor } from "@/adventure/data/v2/monsterScale";
import { V2_SKILLS } from "@/adventure/data/v2/v2Skills";
import type { Monster } from "./types";

const base: Monster = {
  name: "테스트몹",
  tags: ["beast"],
  hp: 100,
  atk: 10,
  def: 5,
  spd: 5,
  exp: 10,
};

describe("resolveMonsterArchetype — 아키타입 프로필 주입", () => {
  it("태그 없음 = 원본 그대로(동일 참조)", () => {
    expect(resolveMonsterArchetype(base)).toBe(base);
  });
  it("caster = atkType magic + matk(atk 폴백)", () => {
    const m = resolveMonsterArchetype({ ...base, archetype: "caster" });
    expect(m.atkType).toBe("magic");
    expect(m.matk).toBe(10);
  });
  it("evasive = evasionPct 18(미지정 시)", () => {
    expect(
      resolveMonsterArchetype({ ...base, archetype: "evasive" }).evasionPct,
    ).toBe(18);
  });
  it("crit = critPct 18 + critMult 1.6", () => {
    const m = resolveMonsterArchetype({ ...base, archetype: "crit" });
    expect(m.critPct).toBe(18);
    expect(m.critMult).toBe(1.6);
  });
  it("명시 필드는 프로필이 덮지 않음(명시 우선)", () => {
    const m = resolveMonsterArchetype({
      ...base,
      archetype: "evasive",
      evasionPct: 40,
    });
    expect(m.evasionPct).toBe(40);
  });
});

describe("scaleMonsterForFloor — 다양성 깊이 스케일", () => {
  it("matk 는 atk 와 같은 배율로 깊이 스케일", () => {
    const caster: Monster = { ...base, archetype: "caster" };
    const d1 = scaleMonsterForFloor(caster, 1);
    const d20 = scaleMonsterForFloor(caster, 20);
    expect(d1.matk).toBe(d1.atk);
    expect(d20.matk).toBe(d20.atk);
    expect(d20.matk!).toBeGreaterThan(d1.matk!);
  });
  it("회피는 깊이로 오르고 캡(45) 점근", () => {
    const ev: Monster = { ...base, evasionPct: 20 };
    const d1 = scaleMonsterForFloor(ev, 1);
    const deep = scaleMonsterForFloor(ev, 50);
    expect(d1.evasionPct).toBe(20); // d1 floorStatMult 1.0 → +0
    expect(deep.evasionPct!).toBeGreaterThan(20);
    expect(deep.evasionPct!).toBeLessThanOrEqual(45);
  });
  it("일반 몹(태그/회피/치명/마공 없음)은 해당 키가 생기지 않음", () => {
    const s = scaleMonsterForFloor(base, 10);
    expect(s.matk).toBeUndefined();
    expect(s.evasionPct).toBeUndefined();
    expect(s.critPct).toBeUndefined();
  });
});

describe("caster — 마법 스킬 시전(PR2)", () => {
  it("caster 프로필이 v2Skills(마력탄) + v2MaxMp 주입(미지정 시)", () => {
    const m = resolveMonsterArchetype({ ...base, archetype: "caster" });
    expect(m.v2Skills?.equipped).toContain("mob_mana_bolt");
    expect(m.v2MaxMp!).toBeGreaterThan(0);
  });
  it("몹이 직접 지정한 v2Skills 는 프로필이 덮지 않음(명시 우선)", () => {
    const m = resolveMonsterArchetype({
      ...base,
      archetype: "caster",
      v2Skills: { learned: ["mob_firebolt"], equipped: ["mob_firebolt"] },
    });
    expect(m.v2Skills?.equipped).toEqual(["mob_firebolt"]);
  });
  it("몹 마법 스킬 3종 = monsterOnly + scaling magic", () => {
    for (const id of ["mob_mana_bolt", "mob_firebolt", "mob_frostwind"] as const) {
      const sk = V2_SKILLS[id];
      expect(sk.monsterOnly, id).toBe(true);
      const dmg = sk.effects.find((e) => e.kind === "damage") as
        | { scaling?: string }
        | undefined;
      expect(dmg?.scaling, id).toBe("magic");
    }
  });
});
