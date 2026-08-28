import { beforeEach, describe, expect, it, vi } from "vitest";
import { ENHANCE_STONE_MATERIAL_ID } from "@/adventure/data/v2/v2Enhance";

const tradeMocks = vi.hoisted(() => {
  class TradeSuspendedError extends Error {}
  const state = { restricted: false };
  return {
    TradeSuspendedError,
    state,
    requireTradeParticipants: vi.fn(async () => {
      if (state.restricted) throw new TradeSuspendedError();
    }),
  };
});

const tx = {};

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (value: typeof tx) => unknown) =>
      callback(tx),
    ),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-member"),
}));
vi.mock("@/lib/server/v2EnsureSoloGuild", () => ({
  getGuildId: vi.fn(async () => 7),
}));
vi.mock("@/lib/server/guildAdmin", () => ({
  isGuildAdmin: vi.fn(async () => false),
}));
vi.mock("@/lib/server/guildFacilities", () => ({
  readGuildFacilityLevel: vi.fn(async () => 1),
}));
vi.mock("@/lib/server/v2Settlement", () => ({
  lockGuildSettlementBuilding: vi.fn(),
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(),
  readSave: vi.fn(),
  upsertSave: vi.fn(async () => undefined),
}));
vi.mock("@/lib/server/guildWarehouse", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/server/guildWarehouse")
  >();
  return {
    ...actual,
    hasGuildWarehousePermission: vi.fn(async () => true),
    readGuildWarehousePermissionUserIds: vi.fn(async () => []),
    lockGuildWarehouse: vi.fn(),
    readGuildWarehouse: vi.fn(),
    upsertGuildWarehouse: vi.fn(async () => undefined),
  };
});
vi.mock("@/lib/server/guildActivityLog", () => ({
  logGuildActivity: vi.fn(async () => undefined),
}));
vi.mock("@/lib/server/tradeSuspension", () => ({
  TradeSuspendedError: tradeMocks.TradeSuspendedError,
  requireTradeParticipants: tradeMocks.requireTradeParticipants,
  tradeSuspendedResponse: () =>
    Response.json({ ok: false, error: "trade_suspended" }, { status: 403 }),
}));

import { isGuildAdmin } from "@/lib/server/guildAdmin";
import { logGuildActivity } from "@/lib/server/guildActivityLog";
import {
  hasGuildWarehousePermission,
  lockGuildWarehouse,
  upsertGuildWarehouse,
} from "@/lib/server/guildWarehouse";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { lockGuildSettlementBuilding } from "@/lib/server/v2Settlement";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";
import { POST } from "./route";

const MATERIAL_ID = ENHANCE_STONE_MATERIAL_ID.red;
const SECOND_MATERIAL_ID = ENHANCE_STONE_MATERIAL_ID.blue;
const EQUIPMENT = {
  iid: "eq-warehouse-1",
  id: "v2_iron_sword" as const,
};
const ENHANCED_EQUIPMENT = {
  ...EQUIPMENT,
  iid: "eq-warehouse-enhanced",
  enhance: { level: 3, bonusPct: 4 },
};
const BOUND_EQUIPMENT = {
  ...EQUIPMENT,
  iid: "eq-warehouse-bound",
  bound: true,
};
const LOCKED_EQUIPMENT = {
  ...EQUIPMENT,
  iid: "eq-warehouse-locked",
  locked: true,
};

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/v2/guild/warehouse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  tradeMocks.state.restricted = false;
  vi.mocked(lockGuildSettlementBuilding).mockResolvedValue({
    village: {
      outpostId: "guild-facility:7:guild_warehouse",
      guildId: 7,
      ownerUserId: null,
      tier: "village",
      name: null,
      productionKind: null,
      unlockedSlots: 1,
      slotKinds: {},
      buildings: { 0: { id: "guild_warehouse", level: 1 } },
      jobs: {},
    },
    slot: 0,
  });
  vi.mocked(lockSaveForUpdate).mockImplementation(
    async (_tx, _userId, key) =>
      key === "equipment.v2"
        ? { owned: [EQUIPMENT], equipped: {} }
        : {
            materials: {
              [MATERIAL_ID]: 10,
              [SECOND_MATERIAL_ID]: 10,
              legacy_material: 4,
            },
          },
  );
  vi.mocked(lockGuildWarehouse).mockResolvedValue({
    materials: { [MATERIAL_ID]: 2 },
    equipment: [],
  });
});

describe("길드 창고 입출고", () => {
  it.each([
    ["입고", { action: "deposit", materialId: MATERIAL_ID, quantity: 1 }],
    ["출고", { action: "withdraw", materialId: MATERIAL_ID, quantity: 1 }],
  ])("거래 정지 길드원의 %s를 자산 잠금 전에 차단한다", async (_label, body) => {
    tradeMocks.state.restricted = true;

    const response = await POST(request(body));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "trade_suspended",
    });
    expect(tradeMocks.requireTradeParticipants).toHaveBeenCalledWith(
      tx,
      ["u-member"],
      expect.any(Date),
    );
    expect(getGuildId).not.toHaveBeenCalled();
    expect(lockSaveForUpdate).not.toHaveBeenCalled();
    expect(lockGuildWarehouse).not.toHaveBeenCalled();
    expect(upsertSave).not.toHaveBeenCalled();
    expect(upsertGuildWarehouse).not.toHaveBeenCalled();
  });

  it("권한이 있어도 길드 창고에 재료를 새로 입고할 수 없다", async () => {
    const response = await POST(
      request({ action: "deposit", materialId: MATERIAL_ID, quantity: 3 }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: "warehouse_equipment_only",
    });
    expect(lockSaveForUpdate).not.toHaveBeenCalled();
    expect(lockGuildWarehouse).not.toHaveBeenCalled();
    expect(upsertSave).not.toHaveBeenCalled();
    expect(upsertGuildWarehouse).not.toHaveBeenCalled();
  });

  it("기존 재료가 슬롯을 채운 창고에는 장비를 추가 입고할 수 없다", async () => {
    const response = await POST(
      request({
        action: "deposit",
        kind: "equipment",
        iid: EQUIPMENT.iid,
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: "capacity_exceeded",
      capacity: 1,
      available: 0,
    });
    expect(upsertSave).not.toHaveBeenCalled();
    expect(upsertGuildWarehouse).not.toHaveBeenCalled();
  });

  it("일반 길드원의 출고 요청은 재료 잠금 전에 거부한다", async () => {
    vi.mocked(hasGuildWarehousePermission).mockResolvedValue(false);
    const response = await POST(
      request({ action: "withdraw", materialId: MATERIAL_ID, quantity: 1 }),
    );

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("not_authorized");
    expect(lockSaveForUpdate).not.toHaveBeenCalled();
    expect(lockGuildWarehouse).not.toHaveBeenCalled();
  });

  it("권한이 없는 일반 길드원의 입고 요청도 거부한다", async () => {
    vi.mocked(hasGuildWarehousePermission).mockResolvedValue(false);
    const response = await POST(
      request({ action: "deposit", materialId: MATERIAL_ID, quantity: 1 }),
    );

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("not_authorized");
    expect(lockSaveForUpdate).not.toHaveBeenCalled();
  });

  it("관리자 출고는 창고 재고를 줄이고 개인 재료를 늘린다", async () => {
    vi.mocked(isGuildAdmin).mockResolvedValue(true);
    const response = await POST(
      request({ action: "withdraw", materialId: MATERIAL_ID, quantity: 2 }),
    );

    expect(response.status).toBe(200);
    expect(upsertSave).toHaveBeenCalledWith(
      tx,
      "u-member",
      "character.v2",
      {
        materials: {
          [MATERIAL_ID]: 12,
          [SECOND_MATERIAL_ID]: 10,
          legacy_material: 4,
        },
      },
    );
    expect(upsertGuildWarehouse).toHaveBeenCalledWith(tx, 7, {
      materials: {},
      equipment: [],
    });
    expect(logGuildActivity).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ type: "warehouse_withdraw" }),
    );
  });

  it("권한을 받은 길드원은 거래 가능한 미착용 장비를 입고한다", async () => {
    vi.mocked(lockGuildWarehouse).mockResolvedValue({
      materials: {},
      equipment: [],
    });
    const response = await POST(
      request({
        action: "deposit",
        kind: "equipment",
        iid: EQUIPMENT.iid,
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ used: 1, capacity: 1 });
    expect(upsertSave).toHaveBeenCalledWith(tx, "u-member", "equipment.v2", {
      owned: [],
      equipped: {},
    });
    expect(upsertGuildWarehouse).toHaveBeenCalledWith(
      tx,
      7,
      expect.objectContaining({
        materials: {},
        equipment: [expect.objectContaining(EQUIPMENT)],
      }),
    );
  });

  it("강화 장비를 창고에 입고하고 강화 상태를 보존한다", async () => {
    vi.mocked(lockSaveForUpdate).mockResolvedValue({
      owned: [ENHANCED_EQUIPMENT],
      equipped: {},
    });
    vi.mocked(lockGuildWarehouse).mockResolvedValue({
      materials: {},
      equipment: [],
    });

    const response = await POST(
      request({
        action: "deposit",
        kind: "equipment",
        iid: ENHANCED_EQUIPMENT.iid,
      }),
    );

    expect(response.status).toBe(200);
    expect(upsertSave).toHaveBeenCalledWith(tx, "u-member", "equipment.v2", {
      owned: [],
      equipped: {},
    });
    expect(upsertGuildWarehouse).toHaveBeenCalledWith(
      tx,
      7,
      expect.objectContaining({ equipment: [ENHANCED_EQUIPMENT] }),
    );
  });

  it("귀속 장비는 창고에 입고할 수 없다", async () => {
    vi.mocked(lockSaveForUpdate).mockResolvedValue({
      owned: [BOUND_EQUIPMENT],
      equipped: {},
    });
    vi.mocked(lockGuildWarehouse).mockResolvedValue({
      materials: {},
      equipment: [],
    });

    const response = await POST(
      request({
        action: "deposit",
        kind: "equipment",
        iid: BOUND_EQUIPMENT.iid,
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: "equipment_not_tradable",
      reason: "bound",
    });
    expect(upsertSave).not.toHaveBeenCalled();
    expect(upsertGuildWarehouse).not.toHaveBeenCalled();
  });

  it("잠금 장비는 창고에 입고할 수 없다", async () => {
    vi.mocked(lockSaveForUpdate).mockResolvedValue({
      owned: [LOCKED_EQUIPMENT],
      equipped: {},
    });
    vi.mocked(lockGuildWarehouse).mockResolvedValue({
      materials: {},
      equipment: [],
    });

    const response = await POST(
      request({
        action: "deposit",
        kind: "equipment",
        iid: LOCKED_EQUIPMENT.iid,
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: "equipment_not_tradable",
      reason: "locked",
    });
    expect(upsertSave).not.toHaveBeenCalled();
    expect(upsertGuildWarehouse).not.toHaveBeenCalled();
  });

  it("착용 중인 장비는 창고에 입고할 수 없다", async () => {
    vi.mocked(lockSaveForUpdate).mockResolvedValue({
      owned: [EQUIPMENT],
      equipped: { weapon: EQUIPMENT.iid },
    });
    vi.mocked(lockGuildWarehouse).mockResolvedValue({
      materials: {},
      equipment: [],
    });
    const response = await POST(
      request({
        action: "deposit",
        kind: "equipment",
        iid: EQUIPMENT.iid,
      }),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("equipment_equipped");
    expect(upsertSave).not.toHaveBeenCalled();
    expect(upsertGuildWarehouse).not.toHaveBeenCalled();
  });

  it("권한을 받은 길드원은 창고 장비를 개인 장비 목록으로 출고한다", async () => {
    vi.mocked(lockSaveForUpdate).mockResolvedValue({ owned: [], equipped: {} });
    vi.mocked(lockGuildWarehouse).mockResolvedValue({
      materials: {},
      equipment: [EQUIPMENT],
    });
    const response = await POST(
      request({
        action: "withdraw",
        kind: "equipment",
        iid: EQUIPMENT.iid,
      }),
    );

    expect(response.status).toBe(200);
    expect(upsertSave).toHaveBeenCalledWith(tx, "u-member", "equipment.v2", {
      owned: [EQUIPMENT],
      equipped: {},
    });
    expect(upsertGuildWarehouse).toHaveBeenCalledWith(tx, 7, {
      materials: {},
      equipment: [],
    });
  });

  it("기존 창고에 보관된 강화 장비는 개인 장비 목록으로 회수할 수 있다", async () => {
    vi.mocked(lockSaveForUpdate).mockResolvedValue({ owned: [], equipped: {} });
    vi.mocked(lockGuildWarehouse).mockResolvedValue({
      materials: {},
      equipment: [ENHANCED_EQUIPMENT],
    });

    const response = await POST(
      request({
        action: "withdraw",
        kind: "equipment",
        iid: ENHANCED_EQUIPMENT.iid,
      }),
    );

    expect(response.status).toBe(200);
    expect(upsertSave).toHaveBeenCalledWith(tx, "u-member", "equipment.v2", {
      owned: [ENHANCED_EQUIPMENT],
      equipped: {},
    });
  });

  it("기존 창고에 보관된 거래 불가 재료는 개인 인벤토리로 회수할 수 있다", async () => {
    vi.mocked(lockSaveForUpdate).mockResolvedValue({ materials: {} });
    vi.mocked(lockGuildWarehouse).mockResolvedValue({
      materials: { v2_reforge_stone: 1 },
      equipment: [],
    });

    const response = await POST(
      request({
        action: "withdraw",
        materialId: "v2_reforge_stone",
        quantity: 1,
      }),
    );

    expect(response.status).toBe(200);
    expect(upsertSave).toHaveBeenCalledWith(tx, "u-member", "character.v2", {
      materials: { v2_reforge_stone: 1 },
    });
  });

  it("카탈로그에 없는 재료는 요청 단계에서 거부한다", async () => {
    const response = await POST(
      request({ action: "deposit", materialId: "unknown", quantity: 1 }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("bad_request");
    expect(lockGuildSettlementBuilding).not.toHaveBeenCalled();
  });
});
