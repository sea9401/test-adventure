// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/CosmeticAvatar", () => ({
  CosmeticAvatar: ({ name }: { name: string }) => <span>{name}</span>,
}));

import { CoopRecentAttackList } from "./CoopRecentAttackList";

afterEach(cleanup);

describe("CoopRecentAttackList", () => {
  it("opens a persisted attack log without embedded replay data", () => {
    const onOpenAttackLog = vi.fn();

    render(
      <CoopRecentAttackList
        attacks={[{
          id: 17,
          name: "모험가",
          damageDealt: 123,
          damageTaken: 45,
          diedEarly: false,
          isMe: true,
          avatar: "male1",
          profileBorder: null,
          at: Date.parse("2026-08-21T00:00:00.000Z"),
        }]}
        onOpenAttackLog={onOpenAttackLog}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /모험가/ }));

    expect(onOpenAttackLog).toHaveBeenCalledWith(17);
  });
});
