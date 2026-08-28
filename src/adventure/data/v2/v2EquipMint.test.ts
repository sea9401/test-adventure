import { describe, expect, it } from "vitest";
import {
  listedEquipBound,
  listedEquipEnhance,
  mintEquipInstance,
  mintListedEquipInstance,
  mintRolledEquipInstance,
} from "./v2EquipMint";
import { V2_EQUIPMENT } from "./v2Equipment";
import { parseEnhance } from "./v2Enhance";

const ANY_ID = Object.keys(V2_EQUIPMENT)[0] as keyof typeof V2_EQUIPMENT;

describe("mintEquipInstance", () => {
  it("새 iid(eq_ 접두)를 발급하고, roll 이 없으면 roll 키 자체가 없다", () => {
    const inst = mintEquipInstance(ANY_ID);
    expect(inst.iid).toMatch(/^eq_/);
    expect(inst.id).toBe(ANY_ID);
    expect("roll" in inst).toBe(false);
  });

  it("iid 는 호출마다 유일하다", () => {
    const iids = new Set(
      Array.from({ length: 50 }, () => mintEquipInstance(ANY_ID).iid),
    );
    expect(iids.size).toBe(50);
  });
});

describe("mintRolledEquipInstance", () => {
  it("카탈로그 기반 굴림이 붙는다 — rng 고정 시 결정적", () => {
    const a = mintRolledEquipInstance(ANY_ID, () => 0.5);
    const b = mintRolledEquipInstance(ANY_ID, () => 0.5);
    expect(a.roll).toBeDefined();
    expect(a.roll).toEqual(b.roll);
    expect(a.iid).not.toBe(b.iid);
  });

  it("새 6티어 굴림에는 현재 위력 보정 버전을 기록한다", () => {
    const inst = mintRolledEquipInstance("v2_storm_gale_bow", () => 0.5);
    expect(inst.roll?.powerScaleVersion).toBe(1);
  });
});

describe("mintListedEquipInstance (거래소 payload 복원)", () => {
  const roll = { power: 12, weight: 1 };

  it("null payload — roll 없는 개체(옛 무굴림 매물)", () => {
    const inst = mintListedEquipInstance(ANY_ID, null);
    expect(inst.id).toBe(ANY_ID);
    expect("roll" in inst).toBe(false);
    expect("enhance" in inst).toBe(false);
  });

  it("raw roll 만 있는 옛 행을 흡수한다", () => {
    const inst = mintListedEquipInstance(ANY_ID, roll);
    expect(inst.roll).toEqual(roll);
  });

  it("옛 폭풍 개량 매물의 위력을 상향하고 개량 표식을 보존한다", () => {
    const inst = mintListedEquipInstance(ANY_ID, {
      power: 620,
      weight: 0,
      powerBase: 550,
      stormRefined: true,
    });
    expect(inst.roll).toMatchObject({
      power: 682,
      powerBase: 605,
      powerScaleVersion: 1,
    });
    expect(inst.stormRefined).toBe(true);
  });

  it("강화 상태를 보존한다 — 만료 회수(expire)도 강화가 소실되면 안 된다", () => {
    const payloadEnhance = { level: 7, bonusPct: 21 };
    const inst = mintListedEquipInstance(ANY_ID, {
      ...roll,
      enhance: payloadEnhance,
    });
    expect(inst.roll).toEqual(roll);
    // parseEnhance 는 bonusPct 를 레벨에서 재파생(payload 값 신뢰 안 함) — 파서 결과와 동일해야.
    expect(inst.enhance).toEqual(parseEnhance(payloadEnhance));
    expect(inst.enhance?.level).toBe(7);
    expect(listedEquipEnhance({ ...roll, enhance: payloadEnhance })?.level).toBe(7);
  });

  it("명시적 craftQuality 와 enhance 를 함께 복원한다", () => {
    const inst = mintListedEquipInstance(ANY_ID, {
      ...roll,
      craftQuality: { level: 1, bonusPct: 6 },
      enhance: { level: 3, bonusPct: 9 },
      craftedBy: { userId: "u1", profession: "blacksmith" },
    });
    expect(inst.craftQuality).toEqual({ level: 1, bonusPct: 5 });
    expect(inst.enhance).toEqual({ level: 3, bonusPct: 4 });
    expect(inst.craftedBy).toMatchObject({ userId: "u1" });
    expect(
      listedEquipEnhance({
        ...roll,
        craftQuality: { level: 1, bonusPct: 6 },
        enhance: { level: 3, bonusPct: 9 },
        craftedBy: { userId: "u1", profession: "blacksmith" },
      }),
    ).toEqual({ level: 3, bonusPct: 4 });
  });

  it("명시적으로 true 인 귀속 상태만 복원한다", () => {
    expect(
      mintListedEquipInstance(ANY_ID, { ...roll, bound: true }),
    ).toMatchObject({ bound: true });
    expect(listedEquipBound({ bound: true })).toBe(true);
    expect(listedEquipBound({ bound: false })).toBe(false);
    expect(listedEquipBound({ bound: "true" })).toBe(false);
    expect(listedEquipBound({ enhance: { level: 9 } })).toBe(false);
    expect(
      mintListedEquipInstance(ANY_ID, { ...roll, bound: false }),
    ).not.toHaveProperty("bound");
  });

  it("restores a traded blacksmith specialty mark", () => {
    const inst = mintListedEquipInstance(ANY_ID, {
      ...roll,
      craftedBy: {
        userId: "u1",
        profession: "blacksmith",
        level: 28,
        craftedAt: "2026-08-22T00:00:00.000Z",
        specialty: "jewelry",
        masterwork: true,
      },
    });

    expect(inst.craftedBy).toMatchObject({
      specialty: "jewelry",
      masterwork: true,
    });
  });
});
