import { describe, expect, it } from "vitest";
import { V2_EQUIPMENT, v2EquipCompareRows } from "./v2Equipment";

// 비교 행 — 카탈로그 값(굴림 없음) 기준. 위력은 WEAPON_POWER_SCALE(×0.8 round) 반영.
//   무게는 표시/전투 스탯에서 제거되고, 일정 이상 무거운 장비만 속도 페널티 옵션으로 노출된다.
//   철검 위력5/속도-4 · 한타검 위력19/속도-6 · 각궁 위력15+치명1% · 목궁 위력5.
const ironSword = { item: V2_EQUIPMENT.v2_iron_sword };
const greatSword = { item: V2_EQUIPMENT.v2_greatsword };
const hornBow = { item: V2_EQUIPMENT.v2_horn_bow };
const woodenBow = { item: V2_EQUIPMENT.v2_wooden_bow };
const oakStaff = { item: V2_EQUIPMENT.v2_oak_staff };
const leatherArmor = { item: V2_EQUIPMENT.v2_leather_armor };
const shadowCloak = { item: V2_EQUIPMENT.v2_shadow_cloak };

function row(rows: ReturnType<typeof v2EquipCompareRows>, label: string) {
  const r = rows.find((x) => x.label === label);
  if (!r) throw new Error(`행 없음: ${label}`);
  return r;
}

describe("v2EquipCompareRows", () => {
  it("공격력 증가는 이득(better=1), 값/증감 포맷이 v2EquipStatRows 와 일치", () => {
    const rows = v2EquipCompareRows(greatSword, ironSword);
    const power = row(rows, "공격력");
    expect(power.value).toBe("+19");
    expect(power.deltaText).toBe("+14"); // 5 → 19
    expect(power.better).toBe(1);
  });

  it("무거운 장비 페널티는 속도 감소 옵션으로 비교된다", () => {
    const rows = v2EquipCompareRows(greatSword, ironSword);
    const spd = row(rows, "속도");
    expect(spd.value).toBe("-6");
    expect(spd.deltaText).toBe("-2"); // -4 → -6
    expect(spd.better).toBe(-1);
  });

  it("후보만 가진 옵션은 이득으로 +값 노출(치명타 +1%)", () => {
    const rows = v2EquipCompareRows(hornBow, woodenBow);
    const crit = row(rows, "치명타");
    expect(crit.value).toBe("+1%");
    expect(crit.deltaText).toBe("+1%");
    expect(crit.better).toBe(1);
  });

  it("검과 지팡이 비교는 공격력과 마법 공격력을 분리한다", () => {
    const rows = v2EquipCompareRows(oakStaff, ironSword);
    expect(row(rows, "공격력").value).toBe("—");
    expect(row(rows, "공격력").better).toBe(-1);
    expect(row(rows, "마법 공격력").value).toBe(
      `+${V2_EQUIPMENT.v2_oak_staff.power}`,
    );
    expect(row(rows, "마법 공격력").better).toBe(1);
  });

  it("경갑 후보의 기본 회피도와 현재 장비 대비 증감을 표시한다", () => {
    const rows = v2EquipCompareRows(shadowCloak, leatherArmor);
    const evasion = row(rows, "회피도");

    expect(evasion.value).toBe("+4");
    expect(evasion.deltaText).toBe("+2");
    expect(evasion.better).toBe(1);
  });

  it("추가 회피도 증감은 퍼센트가 아닌 고정 수치로 표시한다", () => {
    const rows = v2EquipCompareRows(shadowCloak, leatherArmor);
    const evasion = row(rows, "추가 회피도");

    expect(evasion.value).toBe("+2");
    expect(evasion.deltaText).toBe("+2");
  });

  it("후보엔 없고 장착엔 있는 옵션은 '—' + 손해(better=-1)", () => {
    const rows = v2EquipCompareRows(woodenBow, hornBow);
    const crit = row(rows, "치명타");
    expect(crit.value).toBe("—");
    expect(crit.deltaText).toBe("-1%");
    expect(crit.better).toBe(-1);
  });

  it("후보/장착 모두 없는 옵션은 비교 행을 만들지 않는다", () => {
    const rows = v2EquipCompareRows(hornBow, woodenBow);
    expect(rows.find((r) => r.label === "속도")).toBeUndefined();
    expect(rows.find((r) => r.label === "무게")).toBeUndefined();
  });

  it("양쪽 모두 0 인 스탯은 행을 만들지 않는다", () => {
    const rows = v2EquipCompareRows(greatSword, ironSword);
    expect(rows.map((r) => r.label)).toEqual(["공격력", "속도"]);
  });
});
