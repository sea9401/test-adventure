import { beforeEach, describe, expect, it, vi } from "vitest";
import { kstWeekMondayKey } from "@/lib/kst";

const tx = {};

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-diner"),
}));
vi.mock("@/lib/server/adventurerAssociation", () => ({
  associationFacilityLevel: vi.fn(async () => 1),
  canUseAdventurerAssociation: vi.fn(async () => true),
  claimWeeklyFacilitySource: vi.fn(async () => ({ ok: true })),
  readWeeklyFacilitySource: vi.fn(async () => null),
}));
vi.mock("@/lib/server/adventurerAssociationDining", () => ({
  lockAssociationDiningWeekly: vi.fn(),
  saveAssociationDiningWeekly: vi.fn(async () => undefined),
}));
vi.mock("@/lib/server/guildDiningIngredients", () => ({
  lockGuildDiningIngredient: vi.fn(),
  readGuildDiningIngredientBalances: vi.fn(async () => ({})),
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx, _userId, key) =>
    key === "inventory.v2"
      ? { hpCharges: 10_000, mpCharges: 20_000 }
      : {
          weekKey: kstWeekMondayKey(),
          guildId: 0,
          contributionPoints: 0,
          mealsUsed: 0,
        },
  ),
  readSave: vi.fn(async (_tx, _userId, key, fallback) =>
    key === "inventory.v2" ? { hpCharges: 10_000, mpCharges: 20_000 } : fallback,
  ),
  upsertSave: vi.fn(async () => undefined),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));

import { associationFacilityLevel } from "@/lib/server/adventurerAssociation";
import { lockAssociationDiningWeekly } from "@/lib/server/adventurerAssociationDining";
import { POST } from "./route";

function request(menuId: string) {
  return new Request("http://localhost/api/v2/association/dining-hall", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "order", menuId }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(associationFacilityLevel).mockResolvedValue(1);
  vi.mocked(lockAssociationDiningWeekly).mockResolvedValue({
    weekKey: kstWeekMondayKey(),
    selectedMenuIds: ["hearty_stew"],
    pantryPoints: 400,
    targetPoints: 400,
  });
});

describe("모험가 협회 식당", () => {
  it("과거 주간 선택 목록과 무관하게 시설에서 해금된 메뉴를 개인이 주문한다", async () => {
    const response = await POST(request("adventurer_meal"));

    expect(response.status).toBe(200);
    expect((await response.json()).ordered).toMatchObject({
      menuId: "adventurer_meal",
    });
  });

  it("시설 레벨보다 높은 메뉴는 개인 선택에서도 거부한다", async () => {
    vi.mocked(lockAssociationDiningWeekly).mockResolvedValue({
      weekKey: kstWeekMondayKey(),
      selectedMenuIds: ["worker_lunch"],
      pantryPoints: 400,
      targetPoints: 400,
    });

    const response = await POST(request("worker_lunch"));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("menu_unavailable");
  });
});
