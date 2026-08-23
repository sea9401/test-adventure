// @vitest-environment jsdom

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ENHANCE_STONE_MATERIAL_ID } from "@/adventure/data/v2/v2Enhance";
import type { V2EquipInstance } from "@/adventure/data/v2/v2Equipment";
import {
  EquipmentTransferForm,
  GuildWarehousePanel,
  WarehouseEquipmentPickerDialog,
  formatWarehouseEquipmentOptionLabel,
  warehouseErrorText,
} from "./GuildWarehousePanel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const TRANSFERABLE_EQUIPMENT: V2EquipInstance = {
  iid: "warehouse-transfer-boots",
  id: "v2_redfield_ash_boots",
  roll: {
    power: 48,
    weight: 0,
    options: { eva: 19, spd: 18 },
  },
};

function mockWarehouseLoad() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        ok: true,
        level: 1,
        capacity: 3,
        used: 1,
        canTransfer: true,
        canManagePermissions: false,
        personalEquipment: [TRANSFERABLE_EQUIPMENT],
        equippedIids: [],
        warehouse: { [ENHANCE_STONE_MATERIAL_ID.red]: 2 },
        equipment: [],
        members: [],
        activity: [],
      }),
    ),
  );
}

describe("길드 창고 거래 정지 오류", () => {
  it("입출고 제한 응답을 공통 사유와 기간 안내로 변환한다", () => {
    const message = warehouseErrorText(
      {
        error: "trade_suspended",
        reason: "비정상 거래 조사",
        expiresAt: "2026-08-23T00:00:00.000Z",
        permanent: false,
      },
      403,
    );

    expect(message).toContain("거래 이용 제한");
    expect(message).toContain("비정상 거래 조사");
  });

  it("재료 입고 차단을 장비 전용 정책으로 안내한다", () => {
    expect(
      warehouseErrorText({ error: "warehouse_equipment_only" }, 409),
    ).toContain("장비만");
  });
});

describe("장비 전용 길드 창고", () => {
  it("입고 화면에는 장비만 표시한다", async () => {
    mockWarehouseLoad();
    render(createElement(GuildWarehousePanel));

    await screen.findByText("길드 창고 Lv 1");

    expect(screen.getByRole("tab", { name: "장비" })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "재료" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "기존 재료 회수" })).toBeNull();
  });

  it("기존 재료가 있으면 출고 화면에서만 회수 선택지를 표시한다", async () => {
    mockWarehouseLoad();
    render(createElement(GuildWarehousePanel));
    await screen.findByText("길드 창고 Lv 1");

    expect(screen.queryByRole("tab", { name: "기존 재료 회수" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "출고" }));

    expect(screen.getByRole("tab", { name: "기존 재료 회수" })).toBeTruthy();
  });
});

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
    expect(masterworkLabel).toContain("회피도 +53 / 추가 회피도 +19 / 속도 +18");
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
