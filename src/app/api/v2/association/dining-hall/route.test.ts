import { beforeEach, describe, expect, it, vi } from "vitest";
import { kstWeekMondayKey } from "@/lib/kst";

const tx = {};
const testState = vi.hoisted(() => ({
  dining: {
    weekKey: "",
    guildId: 0,
    contributionPoints: 20,
    mealsUsed: 0,
  },
}));

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
vi.mock("@/lib/server/guildDiningIngredients", () => ({
  lockGuildDiningIngredient: vi.fn(async () => ({
    owned: 1_000,
    consume: vi.fn(async () => undefined),
  })),
  readGuildDiningIngredientBalances: vi.fn(async () => ({})),
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx, _userId, key) =>
    key === "inventory.v2"
      ? { hpCharges: 10_000, mpCharges: 20_000 }
      : testState.dining,
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
import { POST } from "./route";

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/v2/association/dining-hall", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function order(menuId: string) {
  return request({ action: "order", menuId });
}

function donateWheat(quantity: number) {
  return request({ action: "donate", ingredientId: "farm:wheat", quantity });
}

beforeEach(() => {
  vi.clearAllMocks();
  testState.dining = {
    weekKey: kstWeekMondayKey(),
    guildId: 0,
    contributionPoints: 20,
    mealsUsed: 0,
  };
  vi.mocked(associationFacilityLevel).mockResolvedValue(1);
});

describe("모험가 협회 식당", () => {
  it("시설에서 해금된 메뉴를 개인 식권으로 주문한다", async () => {
    const response = await POST(order("adventurer_meal"));

    expect(response.status).toBe(200);
    expect((await response.json()).ordered).toMatchObject({
      menuId: "adventurer_meal",
    });
  });

  it("시설 레벨보다 높은 메뉴는 개인 선택에서도 거부한다", async () => {
    const response = await POST(order("worker_lunch"));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("menu_unavailable");
  });

  it("개인 식재료 20점을 기여하면 공동 목표 없이 식권 1장을 얻는다", async () => {
    testState.dining.contributionPoints = 0;

    const response = await POST(donateWheat(20));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.tickets).toMatchObject({
      base: 0,
      earned: 1,
      available: 1,
      contributionCap: null,
    });
  });

  it("기존 개인 기여 한도를 넘어서도 주간 납품을 계속 받는다", async () => {
    testState.dining.contributionPoints = 40;

    const response = await POST(donateWheat(40));

    expect(response.status).toBe(200);
    expect((await response.json()).tickets).toMatchObject({
      earned: 4,
      available: 4,
      contributionCap: null,
    });
  });

  it("개인 기여가 20점 미만이면 공용 진행도와 무관하게 주문을 거부한다", async () => {
    testState.dining.contributionPoints = 19;

    const response = await POST(order("adventurer_meal"));

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("no_meal_ticket");
  });
});
