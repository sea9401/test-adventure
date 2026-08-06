import { beforeEach, describe, expect, it, vi } from "vitest";
import { ENHANCE_STONE_MATERIAL_ID } from "@/adventure/data/v2/v2Enhance";

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

import { isGuildAdmin } from "@/lib/server/guildAdmin";
import { logGuildActivity } from "@/lib/server/guildActivityLog";
import {
  hasGuildWarehousePermission,
  lockGuildWarehouse,
  upsertGuildWarehouse,
} from "@/lib/server/guildWarehouse";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { lockGuildSettlementBuilding } from "@/lib/server/v2Settlement";
import { POST } from "./route";

const MATERIAL_ID = ENHANCE_STONE_MATERIAL_ID.red;
const SECOND_MATERIAL_ID = ENHANCE_STONE_MATERIAL_ID.blue;
const EQUIPMENT = {
  iid: "eq-warehouse-1",
  id: "v2_iron_sword" as const,
  locked: true,
  enhance: { level: 3, bonusPct: 4 },
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
  it("권한을 받은 길드원 입고는 개인 재료 차감과 창고 적립을 같은 트랜잭션에 기록한다", async () => {
    const response = await POST(
      request({ action: "deposit", materialId: MATERIAL_ID, quantity: 3 }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ used: 1, capacity: 1 });
    expect(upsertSave).toHaveBeenCalledWith(
      tx,
      "u-member",
      "character.v2",
      {
        materials: {
          [MATERIAL_ID]: 7,
          [SECOND_MATERIAL_ID]: 10,
          legacy_material: 4,
        },
      },
    );
    expect(upsertGuildWarehouse).toHaveBeenCalledWith(tx, 7, {
      materials: { [MATERIAL_ID]: 5 },
      equipment: [],
    });
    expect(logGuildActivity).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        guildId: 7,
        type: "warehouse_deposit",
        actorUserId: "u-member",
        meta: expect.objectContaining({ materialId: MATERIAL_ID, quantity: 3 }),
      }),
    );
  });

  it("빈 슬롯 없이 새로운 종류를 입고하면 어느 저장소도 변경하지 않는다", async () => {
    const response = await POST(
      request({
        action: "deposit",
        materialId: SECOND_MATERIAL_ID,
        quantity: 2,
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

  it("권한을 받은 길드원은 강화·잠금 정보를 보존해 장비를 입고한다", async () => {
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

  it("카탈로그에 없는 재료는 요청 단계에서 거부한다", async () => {
    const response = await POST(
      request({ action: "deposit", materialId: "unknown", quantity: 1 }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("bad_request");
    expect(lockGuildSettlementBuilding).not.toHaveBeenCalled();
  });
});
