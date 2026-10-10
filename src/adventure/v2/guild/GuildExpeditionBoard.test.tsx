// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GuildExpeditionBoard } from "./GuildExpeditionBoard";

afterEach(cleanup);

const now = Date.parse("2026-10-13T00:00:00.000Z");
const base = {
  nowMs: now,
  canManage: true,
  acting: null,
  confirmingExpeditionId: null,
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
  onDispatch: vi.fn(),
  onClaim: vi.fn(),
};

describe("원정대 파견 현황", () => {
  it("동시 한도가 남으면 진행 중 원정과 파견 목록을 함께 보여주고 진행 중 원정은 파견할 수 없다", () => {
    render(
      <GuildExpeditionBoard
        {...base}
        level={8}
        concurrentLimit={2}
        active={[{ expeditionId: "ancient_ruins", startedAt: "2026-10-12T20:00:00.000Z", endsAt: "2026-10-12T22:00:00.000Z" }]}
      />,
    );
    expect(screen.getByText("진행 중 1/2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "고대 유적 답사 보상 회수" }));
    expect(base.onClaim).toHaveBeenCalledWith("ancient_ruins");
    expect(screen.getByRole("button", { name: "안개 숲 수색 파견" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "고대 유적 답사 파견" })).toBeNull();
  });

  it("한도가 차면 파견 목록을 숨긴다", () => {
    render(
      <GuildExpeditionBoard
        {...base}
        level={7}
        concurrentLimit={1}
        active={[{ expeditionId: "ancient_ruins", startedAt: "2026-10-12T20:00:00.000Z", endsAt: "2026-10-13T22:00:00.000Z" }]}
      />,
    );
    expect(screen.queryByRole("button", { name: "안개 숲 수색 파견" })).toBeNull();
    expect(
      (screen.getByRole("button", { name: "고대 유적 답사 보상 회수" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("Lv.10은 단축된 시간과 길드원 보상을 보여준다", () => {
    render(
      <GuildExpeditionBoard {...base} level={10} concurrentLimit={2} active={[]} />,
    );
    expect(screen.getByText("21시간 36분")).toBeTruthy();
    expect(screen.getByText("1시간 48분")).toBeTruthy();
    expect(screen.getByText("길드원 전원 보스 소환서 1장")).toBeTruthy();
  });
});
