import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = {
  select: vi.fn(),
};

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (value: typeof tx) => unknown) =>
      callback(tx),
    ),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-manager"),
}));
vi.mock("@/lib/server/v2EnsureSoloGuild", () => ({
  getGuildId: vi.fn(async () => 7),
}));
vi.mock("@/lib/server/guildAdmin", () => ({
  isGuildAdmin: vi.fn(async () => true),
}));
vi.mock("@/lib/server/v2Settlement", () => ({
  lockGuildSettlementBuilding: vi.fn(async () => ({ slot: 0 })),
}));
vi.mock("@/lib/server/guildWarehouse", () => ({
  setGuildWarehousePermission: vi.fn(async () => undefined),
}));
vi.mock("@/lib/server/guildActivityLog", () => ({
  logGuildActivity: vi.fn(async () => undefined),
}));

import { isGuildAdmin } from "@/lib/server/guildAdmin";
import { logGuildActivity } from "@/lib/server/guildActivityLog";
import { setGuildWarehousePermission } from "@/lib/server/guildWarehouse";
import { lockGuildSettlementBuilding } from "@/lib/server/v2Settlement";
import { POST } from "./route";

function request(body: Record<string, unknown>) {
  return new Request(
    "http://localhost/api/v2/guild/warehouse/permissions",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

function mockTargetRole(role: string | null) {
  tx.select.mockReturnValue({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(async () => (role == null ? [] : [{ role }])),
      })),
    })),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isGuildAdmin).mockResolvedValue(true);
  vi.mocked(lockGuildSettlementBuilding).mockResolvedValue({
    slot: 0,
  } as never);
  mockTargetRole("member");
});

describe("길드 창고 입출고 권한", () => {
  it("관리자가 일반 길드원에게 입고·출고 권한을 함께 부여한다", async () => {
    const response = await POST(request({ userId: "u-member", allowed: true }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      userId: "u-member",
      allowed: true,
    });
    expect(setGuildWarehousePermission).toHaveBeenCalledWith(tx, {
      guildId: 7,
      userId: "u-member",
      grantedBy: "u-manager",
      allowed: true,
    });
    expect(logGuildActivity).toHaveBeenCalledWith(tx, {
      guildId: 7,
      type: "warehouse_permission_change",
      actorUserId: "u-manager",
      targetUserId: "u-member",
      meta: { permissionEnabled: true },
    });
  });

  it("같은 설정에서 권한을 회수할 수 있다", async () => {
    const response = await POST(
      request({ userId: "u-member", allowed: false }),
    );

    expect(response.status).toBe(200);
    expect(setGuildWarehousePermission).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ userId: "u-member", allowed: false }),
    );
  });

  it("일반 길드원은 다른 길드원의 권한을 변경할 수 없다", async () => {
    vi.mocked(isGuildAdmin).mockResolvedValue(false);

    const response = await POST(request({ userId: "u-member", allowed: true }));

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("not_authorized");
    expect(lockGuildSettlementBuilding).not.toHaveBeenCalled();
    expect(setGuildWarehousePermission).not.toHaveBeenCalled();
  });

  it("현재 길드원이 아닌 사용자에게는 권한을 부여하지 않는다", async () => {
    mockTargetRole(null);

    const response = await POST(request({ userId: "u-outsider", allowed: true }));

    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("member_not_found");
    expect(setGuildWarehousePermission).not.toHaveBeenCalled();
  });

  it("기본 권한이 있는 마스터·관리자는 별도 권한 대상으로 두지 않는다", async () => {
    mockTargetRole("manager");

    const response = await POST(request({ userId: "u-admin", allowed: true }));

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("admin_default_access");
    expect(setGuildWarehousePermission).not.toHaveBeenCalled();
  });
});
