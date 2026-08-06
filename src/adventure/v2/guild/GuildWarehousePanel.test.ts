import { describe, expect, it } from "vitest";
import type { V2EquipInstance } from "@/adventure/data/v2/v2Equipment";
import { formatWarehouseEquipmentOptionLabel } from "./GuildWarehousePanel";

describe("길드 창고 장비 선택 표시", () => {
  it("같은 베이스 장비도 개체 수치와 제작 정보를 함께 표시한다", () => {
    const plain: V2EquipInstance = {
      iid: "plain-boots",
      id: "v2_redfield_ash_boots",
      roll: {
        power: 40,
        weight: 0,
        options: { eva: 15, spd: 14 },
      },
    };
    const masterwork: V2EquipInstance = {
      iid: "masterwork-boots",
      id: "v2_redfield_ash_boots",
      roll: {
        power: 48,
        weight: 0,
        options: { eva: 19, spd: 18 },
      },
      craftQuality: { level: 2, bonusPct: 10 },
      craftedBy: {
        userId: "artisan-1",
        name: "폴라",
        profession: "blacksmith",
        level: 10,
        craftedAt: "2026-08-06T00:00:00.000Z",
        masterwork: true,
      },
      locked: true,
    };

    const plainLabel = formatWarehouseEquipmentOptionLabel(plain);
    const masterworkLabel = formatWarehouseEquipmentOptionLabel(masterwork);

    expect(plainLabel).toContain("기폭 사냥화 · 신발");
    expect(plainLabel).toContain("방어력 +40 / 회피 +15% / 속도 +14");
    expect(plainLabel).toMatch(/품질 \d+%/);
    expect(masterworkLabel).toContain("기폭 사냥화 · 신발 · 명장 · ★★ 품질");
    expect(masterworkLabel).toContain("방어력 +52 / 회피 +19% / 속도 +18");
    expect(masterworkLabel).toMatch(/품질 \d+%/);
    expect(masterworkLabel).toContain("제작 폴라 · 잠금");
    expect(masterworkLabel).not.toBe(plainLabel);
  });
});
