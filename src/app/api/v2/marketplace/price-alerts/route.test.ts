import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireTradeParticipants: vi.fn(async () => {
    throw new Error("strict trade guard must not run for price alerts");
  }),
  insertedValues: [] as Array<Record<string, unknown>>,
}));

let selectCount = 0;
const tx = {
  select: () => ({
    from: () => ({
      where: () => {
        const result = selectCount++ === 0 ? [] : [{ value: 0 }];
        return {
          limit: async () => result,
          then: <T>(resolve: (value: typeof result) => T) =>
            Promise.resolve(result).then(resolve),
        };
      },
    }),
  }),
  insert: () => ({
    values: (value: Record<string, unknown>) => {
      mocks.insertedValues.push(value);
      return { returning: async () => [{ id: 19 }] };
    },
  }),
};

vi.mock("@/db", () => ({
  db: { transaction: vi.fn(async (callback: (executor: typeof tx) => unknown) => callback(tx)) },
}));
vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: vi.fn(async () => "restricted-user") }));
vi.mock("@/lib/server/userRateLimit", () => ({ enforceUserAndIpRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/server/savesKv", () => ({ lockSaveForUpdate: vi.fn(async () => ({})) }));
vi.mock("@/lib/server/tradeSuspension", () => ({
  requireTradeParticipants: mocks.requireTradeParticipants,
}));

import { requireTradeParticipants } from "@/lib/server/tradeSuspension";
import { POST } from "./route";

function request() {
  return new Request("http://localhost/api/v2/marketplace/price-alerts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind: "material",
      itemId: "v2_iron_ore",
      targetUnitPrice: 500,
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.insertedValues.length = 0;
  selectCount = 0;
});

describe("거래소 가격 알림", () => {
  it("거래 제한 사용자도 가격 알림을 만들고 엄격 거래 가드를 호출하지 않는다", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, id: 19, updated: false });
    expect(mocks.insertedValues).toEqual([
      expect.objectContaining({
        userId: "restricted-user",
        kind: "material",
        itemId: "v2_iron_ore",
        targetUnitPrice: 500,
      }),
    ]);
    expect(requireTradeParticipants).not.toHaveBeenCalled();
  });
});
