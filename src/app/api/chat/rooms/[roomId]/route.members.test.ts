import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    selectRows: [] as unknown[][],
  };

  const query = (rows: unknown[]) => {
    const builder: Record<string, unknown> = {};
    for (const method of ["from", "innerJoin", "where", "orderBy", "limit"]) {
      builder[method] = vi.fn(() => builder);
    }
    builder.then = (
      resolve: (value: unknown[]) => unknown,
      reject?: (error: unknown) => unknown,
    ) => Promise.resolve(rows).then(resolve, reject);
    return builder;
  };

  return {
    state,
    ensureUser: vi.fn(async () => "u-viewer" as string | null),
    select: vi.fn(() => query(state.selectRows.shift() ?? [])),
  };
});

vi.mock("@/db", () => ({
  db: {
    select: mocks.select,
  },
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: mocks.ensureUser,
}));

import { GET } from "./route";

function get(roomId = "7") {
  return GET(new Request(`http://localhost/api/chat/rooms/${roomId}`), {
    params: Promise.resolve({ roomId }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.selectRows = [];
  mocks.ensureUser.mockResolvedValue("u-viewer");
});

describe("GET /api/chat/rooms/[roomId] members", () => {
  it("채팅방에 참여하지 않은 사용자의 명단 조회를 거절한다", async () => {
    mocks.state.selectRows = [[]];

    const response = await get();

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("not in room");
  });

  it("참여자 이름과 역할을 방장 우선으로 직렬화한다", async () => {
    mocks.state.selectRows = [
      [{ userId: "u-viewer" }],
      [
        {
          userId: "u-owner",
          name: "마녀",
          role: "owner",
          joinedAt: new Date("2026-08-25T10:00:00.000Z"),
        },
        {
          userId: "u-member",
          name: null,
          role: "member",
          joinedAt: new Date("2026-08-25T11:00:00.000Z"),
        },
      ],
    ];

    const response = await get();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      members: [
        {
          userId: "u-owner",
          name: "마녀",
          role: "owner",
          joinedAt: 1_787_652_000_000,
        },
        {
          userId: "u-member",
          name: "모험가",
          role: "member",
          joinedAt: 1_787_655_600_000,
        },
      ],
    });
  });
});
