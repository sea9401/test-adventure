import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { V2EquipInstance } from "@/adventure/data/v2/v2Equipment";
import {
  EquipmentTransferForm,
  WarehouseEquipmentPickerDialog,
  formatWarehouseEquipmentOptionLabel,
} from "./GuildWarehousePanel";

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
    expect(plainLabel).toContain("회피도 +40 / 추가 회피도 +15 / 속도 +14");
    expect(plainLabel).toMatch(/품질 \d+%/);
    expect(masterworkLabel).toContain("기폭 사냥화 · 신발 · 명장 · ★★ 품질");
    expect(masterworkLabel).toContain("회피도 +52.8 / 추가 회피도 +19 / 속도 +18");
    expect(masterworkLabel).toMatch(/품질 \d+%/);
    expect(masterworkLabel).toContain("제작 폴라 · 잠금");
    expect(masterworkLabel).not.toBe(plainLabel);
  });

  it("모바일 기본 select 대신 장비 선택 모달을 여는 요약 카드를 표시한다", () => {
    const equipment: V2EquipInstance = {
      iid: "warehouse-picker-boots",
      id: "v2_redfield_ash_boots",
      roll: {
        power: 48,
        weight: 0,
        options: { eva: 19, spd: 18 },
      },
    };

    const html = renderToStaticMarkup(
      createElement(EquipmentTransferForm, {
        action: "deposit",
        candidates: [equipment],
        activeEquipmentIid: equipment.iid,
        busy: false,
        onEquipmentChange: vi.fn(),
        onSubmit: vi.fn(),
      }),
    );

    expect(html).toContain("기폭 사냥화");
    expect(html).toContain("변경");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain("<select");
  });

  it("전용 모달은 장비 정보를 이름·배지·옵션으로 나눠 표시한다", () => {
    const equipment: V2EquipInstance = {
      iid: "warehouse-modal-boots",
      id: "v2_redfield_ash_boots",
      roll: {
        power: 48,
        weight: 0,
        options: { eva: 19, spd: 18 },
      },
      locked: true,
    };

    const html = renderToStaticMarkup(
      createElement(WarehouseEquipmentPickerDialog, {
        action: "withdraw",
        candidates: [equipment],
        selectedIid: equipment.iid,
        onClose: vi.fn(),
        onSelect: vi.fn(),
      }),
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain("출고할 장비 선택");
    expect(html).toContain("장비명·옵션·제작자 검색");
    expect(html).toContain("기폭 사냥화");
    expect(html).toContain("회피도");
    expect(html).toContain("추가 회피도");
    expect(html).toContain("속도");
    expect(html).toContain("잠금");
  });
});
