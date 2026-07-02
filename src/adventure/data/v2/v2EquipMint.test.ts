import { describe, expect, it } from "vitest";
import {
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
  });

  it("craftQuality 가 있으면 enhance 는 무시(동시 부착 금지 규약)", () => {
    const inst = mintListedEquipInstance(ANY_ID, {
      ...roll,
      craftQuality: { level: 1, bonusPct: 6 },
      enhance: { level: 3, bonusPct: 9 },
      craftedBy: { userId: "u1", profession: "blacksmith" },
    });
    expect(inst.craftQuality).toBeDefined();
    expect("enhance" in inst).toBe(false);
    expect(inst.craftedBy).toMatchObject({ userId: "u1" });
  });
});
