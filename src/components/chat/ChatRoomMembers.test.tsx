// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChatRoomMembers } from "./ChatRoomMembers";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ChatRoomMembers", () => {
  it("버튼을 열면 최신 참여자 명단과 방장을 표시한다", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        members: [
          {
            userId: "u-owner",
            name: "마녀",
            role: "owner",
            joinedAt: 1_787_652_000_000,
          },
          {
            userId: "u-member",
            name: "길드원",
            role: "member",
            joinedAt: 1_787_655_600_000,
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onSelectName = vi.fn();

    render(
      <ChatRoomMembers
        roomId={7}
        memberCount={2}
        onSelectName={onSelectName}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "채팅방 참여자 2명 보기" }),
    );

    expect(
      await screen.findByRole("region", { name: "채팅방 참여자" }),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/chat/rooms/7", {
      cache: "no-store",
    });
    expect(screen.getByText("참여자 2명")).toBeTruthy();
    expect(screen.getByRole("button", { name: "마녀 프로필 보기" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "길드원 프로필 보기" })).toBeTruthy();
    expect(screen.getByText("방장")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "길드원 프로필 보기" }));
    expect(onSelectName).toHaveBeenCalledWith("길드원");
  });

  it("명단 조회 실패 후 다시 시도할 수 있다", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce(
        Response.json({
          members: [
            {
              userId: "u-owner",
              name: "마녀",
              role: "owner",
              joinedAt: 1_787_652_000_000,
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ChatRoomMembers
        roomId={7}
        memberCount={1}
        onSelectName={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "채팅방 참여자 1명 보기" }),
    );

    expect(
      await screen.findByText("참여자 명단을 불러오지 못했습니다."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(await screen.findByRole("button", { name: "마녀 프로필 보기" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
