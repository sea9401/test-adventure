// PR-5: derivePlayerCombatV2 가 라이브 derive 호출 안 하고 자체 식. db 의존이라
// 전체 호출은 단위 테스트 어려움 — pure 함수 분리한 aggregateV2Equipment 만 단위로.
// (식 자체 검증은 통합 테스트 또는 sim 으로.)

import { describe, expect, it } from "vitest";
import { aggregateV2Equipment } from "./derivePlayerCombatV2";
import { V2_EQUIPMENT, type V2EquipmentId } from "@/adventure/data/v2/v2Equipment";

describe("aggregateV2Equipment", () => {
  it("빈 장비 → 모든 키 0", () => {
    expect(aggregateV2Equipment({})).toEqual({
      str: 0,
      dex: 0,
      vit: 0,
      spd: 0,
      luk: 0,
      int: 0,
      atk: 0,
      def: 0,
      crit: 0,
      mp: 0,
      eva: 0,
      hp: 0,
    });
  });

  it("철검 T1 (str+5 atk+3) → str=5 atk=3 나머지 0", () => {
    const a = aggregateV2Equipment({ weapon: "v2_iron_sword" });
    expect(a.str).toBe(5);
    expect(a.atk).toBe(3);
    expect(a.dex).toBe(0);
    expect(a.crit).toBe(0);
  });

  it("3슬롯 풀세팅 — 모든 키 합산", () => {
    // 철검: str+5 atk+3
    // 쇠사슬 갑옷: vit+5 def+6
    // 은가락지: luk+3
    const a = aggregateV2Equipment({
      weapon: "v2_iron_sword",
      armor: "v2_chain_mail",
      accessory: "v2_silver_ring",
    });
    expect(a.str).toBe(5);
    expect(a.atk).toBe(3);
    expect(a.vit).toBe(5);
    expect(a.def).toBe(6);
    expect(a.luk).toBe(3);
  });

  it("추가 파생 (crit/mp/eva) 합산 — T5 풀", () => {
    // 별노래궁 T5: dex+25 atk+14 crit+7
    // 바람 망토 T5: dex+17 def+13 eva+10
    // 마나의 정수 T5: int+22 mp+90
    const a = aggregateV2Equipment({
      weapon: "v2_starsong_bow",
      armor: "v2_windweave_cloak",
      accessory: "v2_mana_essence",
    });
    expect(a.dex).toBe(25 + 17);
    expect(a.atk).toBe(14);
    expect(a.crit).toBe(7);
    expect(a.def).toBe(13);
    expect(a.eva).toBe(10);
    expect(a.int).toBe(22);
    expect(a.mp).toBe(90);
  });

  it("luck 컨셉 5종은 luk/crit 만 채움 (재조정 후 컨셉 일관성)", () => {
    for (const id of [
      "v2_silver_ring",
      "v2_gold_ring",
      "v2_lucky_charm",
      "v2_stardust_ring",
      "v2_fate_ring",
    ] as const) {
      const stats = V2_EQUIPMENT[id as V2EquipmentId].stats;
      const allowed = new Set(["luk", "crit"]);
      for (const k of Object.keys(stats)) {
        expect(
          allowed.has(k),
          `${id}.stats.${k} 는 luck 컨셉 외 키`,
        ).toBe(true);
      }
    }
  });
});
