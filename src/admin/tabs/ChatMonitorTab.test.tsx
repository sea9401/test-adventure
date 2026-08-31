// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type {
  AdminChatMessagesResponse,
  AdminChatRoomsResponse,
} from "@/lib/admin-chat-monitor";

const mocks = vi.hoisted(() => ({
  adminGet: vi.fn(),
}));

vi.mock("../api", () => ({
  adminGet: mocks.adminGet,
}));

import {
  ChatMonitorTab,
  mergeOlderAdminChatMessages,
} from "./ChatMonitorTab";

const roomTarget = {
  targetKey: "room:7" as const,
  kind: "room" as const,
  scopeId: 7,
  label: "비밀 작전방",
  visibility: "private" as const,
  ownerId: "owner-1",
  ownerName: "방장",
  memberCount: 2,
  latestMessageAt: "2026-08-27T08:00:00.000Z",
};

const roomsResponse: AdminChatRoomsResponse = {
  targets: [
    {
      targetKey: "global",
      kind: "global",
      label: "전체 채팅",
      latestMessageAt: "2026-08-27T09:00:00.000Z",
    },
    roomTarget,
  ],
  total: 2,
  hasMore: false,
};

const roomMessagesResponse: AdminChatMessagesResponse = {
  target: roomTarget,
  participants: [
    {
      userId: "owner-1",
      name: "방장",
      role: "owner",
      joinedAt: "2026-08-26T08:00:00.000Z",
    },
    {
      userId: "member-1",
      name: "참여자",
      role: "member",
      joinedAt: "2026-08-26T09:00:00.000Z",
    },
  ],
  messages: [
    {
      id: 31,
      authorUserId: "owner-1",
      name: "방장",
      className: "전사",
      title: null,
      content: "작전 시작",
      itemLink: null,
      createdAt: "2026-08-27T08:00:00.000Z",
    },
  ],
  hasMore: false,
  nextBeforeId: null,
};

const roomTargetB = {
  ...roomTarget,
  targetKey: "room:9" as const,
  scopeId: 9,
  label: "두 번째 방",
  ownerId: "owner-2",
  ownerName: "두번째방장",
};

const roomBMessagesResponse: AdminChatMessagesResponse = {
  target: roomTargetB,
  participants: [],
  messages: [
    {
      id: 41,
      authorUserId: "owner-2",
      name: "두번째방장",
      className: "마법사",
      title: null,
      content: "두 번째 메시지",
      itemLink: null,
      createdAt: "2026-08-27T09:00:00.000Z",
    },
  ],
  hasMore: false,
  nextBeforeId: null,
};

afterEach(() => cleanup());

describe("ChatMonitorTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adminGet.mockImplementation(async (url: string) =>
      url.includes("/rooms?") ? roomsResponse : roomMessagesResponse,
    );
  });

  it("이전 페이지 메시지를 ID 중복 없이 합친다", () => {
    const current = roomMessagesResponse.messages;
    const duplicate = { ...current[0] };
    const older = {
      ...current[0],
      id: 30,
      content: "더 오래된 메시지",
    };

    expect(
      mergeOlderAdminChatMessages(current, [duplicate, older]).map(
        (message) => message.id,
      ),
    ).toEqual([31, 30]);
  });

  it("읽기 전용 안내와 비공개방을 표시하고 선택한 대화를 조회한다", async () => {
    render(<ChatMonitorTab />);

    expect(screen.getByText(/최고 관리자 전용/)).toBeTruthy();
    const roomButton = await screen.findByRole("button", {
      name: /비밀 작전방/,
    });
    expect(within(roomButton).getByText("비공개")).toBeTruthy();

    fireEvent.click(roomButton);

    expect(await screen.findByText("작전 시작")).toBeTruthy();
    expect(screen.getByText("참여자 2명")).toBeTruthy();
    expect(screen.getByText("member-1")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: /메시지/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /입장|초대|삭제/ })).toBeNull();
  });

  it("늦게 도착한 이전 방 응답이 새로 선택한 방을 덮지 않는다", async () => {
    let resolveFirstRoom!: (value: AdminChatMessagesResponse) => void;
    const firstRoomPromise = new Promise<AdminChatMessagesResponse>(
      (resolve) => {
        resolveFirstRoom = resolve;
      },
    );
    mocks.adminGet.mockImplementation(async (url: string) => {
      if (url.includes("/rooms?")) {
        return {
          targets: [roomTarget, roomTargetB],
          total: 2,
          hasMore: false,
        } satisfies AdminChatRoomsResponse;
      }
      if (url.includes("scopeId=7")) return firstRoomPromise;
      return roomBMessagesResponse;
    });
    render(<ChatMonitorTab />);

    fireEvent.click(
      await screen.findByRole("button", { name: /비밀 작전방/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: /두 번째 방/ }));

    expect(await screen.findByText("두 번째 메시지")).toBeTruthy();
    resolveFirstRoom(roomMessagesResponse);
    await waitFor(() => {
      expect(screen.queryByText("작전 시작")).toBeNull();
      expect(screen.getByText("두 번째 메시지")).toBeTruthy();
    });
  });

  it("이전 메시지 실패 시 기존 메시지를 유지하고 다시 시도할 수 있다", async () => {
    const firstPage = {
      ...roomMessagesResponse,
      hasMore: true,
      nextBeforeId: 31,
    } satisfies AdminChatMessagesResponse;
    mocks.adminGet.mockImplementation(async (url: string) => {
      if (url.includes("/rooms?")) return roomsResponse;
      if (url.includes("beforeId=31")) throw new Error("HTTP 500");
      return firstPage;
    });
    render(<ChatMonitorTab />);

    fireEvent.click(
      await screen.findByRole("button", { name: /비밀 작전방/ }),
    );
    expect(await screen.findByText("작전 시작")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "이전 메시지 더 보기" }),
    );

    expect(
      await screen.findByRole("button", {
        name: "이전 메시지 다시 시도",
      }),
    ).toBeTruthy();
    expect(screen.getByText("작전 시작")).toBeTruthy();
  });
});
