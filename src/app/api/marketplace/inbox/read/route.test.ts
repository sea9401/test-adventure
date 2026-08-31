import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  inboxRows: [] as Array<{
    id: number;
    kind: string;
    payload: unknown;
    readAt: Date | null;
    claimedAt: Date | null;
  }>,
  updates: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u1"),
}));

vi.mock("@/db", () => {
  const selectChain: Record<string, unknown> = {};
  selectChain.from = () => selectChain;
  selectChain.where = () => selectChain;
  selectChain.for = () => selectChain;
  selectChain.then = (
    resolve: (value: unknown[]) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise.resolve(mocks.inboxRows).then(resolve, reject);

  const tx = {
    select: () => selectChain,
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          mocks.updates.push(values);
        },
      }),
    }),
  };

  return {
    db: {
      transaction: (callback: (value: typeof tx) => unknown) => callback(tx),
    },
  };
});

import { POST } from "./route";

function request(id: unknown = 1): Request {
  return new Request("http://t/api/marketplace/inbox/read", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id }),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-12T04:00:00.000Z"));
  mocks.inboxRows.length = 0;
  mocks.updates.length = 0;
});

describe("POST /api/marketplace/inbox/read", () => {
  it("보상 없는 쪽지는 여는 즉시 읽음과 완료를 함께 기록한다", async () => {
    mocks.inboxRows.push({
      id: 1,
      kind: "user_message",
      payload: { text: "안녕" },
      readAt: null,
      claimedAt: null,
    });

    const response = await POST(request());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.updates).toEqual([
      {
        readAt: new Date("2026-08-12T04:00:00.000Z"),
        claimedAt: new Date("2026-08-12T04:00:00.000Z"),
      },
    ]);
    expect(json).toMatchObject({
      claimState: "none",
      readAt: "2026-08-12T04:00:00.000Z",
      claimedAt: "2026-08-12T04:00:00.000Z",
    });
  });

  it("보상 우편은 읽음만 기록하고 미수령으로 남긴다", async () => {
    mocks.inboxRows.push({
      id: 1,
      kind: "admin_gift",
      payload: { gold: 500 },
      readAt: null,
      claimedAt: null,
    });

    const response = await POST(request());
    const json = await response.json();

    expect(mocks.updates).toEqual([
      { readAt: new Date("2026-08-12T04:00:00.000Z") },
    ]);
    expect(json).toMatchObject({
      claimState: "claimable",
      readAt: "2026-08-12T04:00:00.000Z",
      claimedAt: null,
    });
  });

  it("길드 초대와 손상 우편은 읽어도 자동 완료하지 않는다", async () => {
    for (const row of [
      {
        id: 1,
        kind: "guild_invite",
        payload: {
          invite_id: 7,
          guild_id: 42,
          guild_name: "철의장막",
          expires_at: "2026-08-20T00:00:00.000Z",
        },
        readAt: null,
        claimedAt: null,
      },
      {
        id: 2,
        kind: "season_reward",
        payload: { season: "broken", coins: 100 },
        readAt: null,
        claimedAt: null,
      },
    ]) {
      mocks.inboxRows.splice(0, mocks.inboxRows.length, row);
      mocks.updates.length = 0;

      const response = await POST(request(row.id));
      const json = await response.json();

      expect(mocks.updates).toEqual([
        { readAt: new Date("2026-08-12T04:00:00.000Z") },
      ]);
      expect(json.claimedAt).toBeNull();
    }
  });

  it("이미 읽은 우편은 기존 시각을 유지하며 다시 갱신하지 않는다", async () => {
    mocks.inboxRows.push({
      id: 1,
      kind: "admin_gift",
      payload: { gold: 500 },
      readAt: new Date("2026-08-11T00:00:00.000Z"),
      claimedAt: null,
    });

    const response = await POST(request());
    const json = await response.json();

    expect(mocks.updates).toEqual([]);
    expect(json.readAt).toBe("2026-08-11T00:00:00.000Z");
  });

  it("잘못된 ID와 소유하지 않은 우편을 거부한다", async () => {
    expect((await POST(request(0))).status).toBe(400);
    expect((await POST(request("1"))).status).toBe(400);
    expect((await POST(request("bad"))).status).toBe(400);
    expect((await POST(request(99))).status).toBe(404);
  });
});
