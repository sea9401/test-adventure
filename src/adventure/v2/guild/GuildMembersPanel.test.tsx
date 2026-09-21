// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GuildMembersPanel } from "./GuildMembersPanel";
import type { GuildInfoResponse } from "./guildShared";

const confirm = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/gameDialog", () => ({ confirmGameAction: confirm }));
vi.mock("../GuildOrgChart", () => ({ GuildOrgChart: () => <div>길드 조직도</div> }));

const fetchMock = vi.fn();
function setup(overrides: Partial<Parameters<typeof GuildMembersPanel>[0]> = {}) {
  const props = {
    info: {
      guild: { id: 7, masterId: "old-master" },
      canClaimLeadership: true,
      members: [],
    } as unknown as GuildInfoResponse,
    loading: false,
    isMaster: false,
    acting: false,
    setActing: vi.fn(),
    notice: null,
    setNotice: vi.fn(),
    onRefresh: vi.fn(async () => {}),
    onGuildChanged: vi.fn(),
    ...overrides,
  };
  render(<GuildMembersPanel {...props} />);
  return props;
}
beforeEach(() => {
  confirm.mockResolvedValue(true);
  fetchMock.mockResolvedValue(Response.json({ ok: true, newMasterId: "applicant" }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe("길드원 탭 길드장 승계", () => {
  it("일반 길드원에게 3일 조건과 승계 버튼을 표시한다", () => {
    setup();
    expect(screen.getByRole("button", { name: "길드장 승계" })).toBeTruthy();
    expect(screen.getByText(/3일.*72시간/)).toBeTruthy();
  });
  it.each([
    { isMaster: true },
    { info: { canClaimLeadership: false } },
    { info: null },
  ])("승계할 수 없으면 버튼을 표시하지 않는다: %j", (overrides) => {
    setup(overrides);
    expect(screen.queryByRole("button", { name: "길드장 승계" })).toBeNull();
  });
  it("처리 중에는 버튼을 비활성화한다", () => {
    setup({ acting: true });
    expect((screen.getByRole("button", { name: "길드장 승계" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("취소하면 승계 요청을 보내지 않는다", async () => {
    confirm.mockResolvedValue(false);
    setup();
    fireEvent.click(screen.getByRole("button", { name: "길드장 승계" }));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("확인 후 현재 길드장을 지정해 요청하고 권한과 정보를 새로고침한다", async () => {
    const props = setup();
    fireEvent.click(screen.getByRole("button", { name: "길드장 승계" }));
    await waitFor(() => expect(props.onGuildChanged).toHaveBeenCalledTimes(1));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("일반 길드원"));
    expect(fetchMock).toHaveBeenCalledWith("/api/v2/guild/claim-leadership", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedMasterId: "old-master" }),
    });
    expect(props.onRefresh).toHaveBeenCalledTimes(1);
    expect(props.setActing).toHaveBeenNthCalledWith(1, true);
    expect(props.setActing).toHaveBeenNthCalledWith(2, false);
    expect(props.setNotice).toHaveBeenCalledWith({ kind: "ok", text: "길드장 자리를 승계했어요." });
  });
  it.each([
    ["master_active", "3일"],
    ["master_changed", "바뀌었어요"],
    ["no_guild", "소속"],
  ])("서버 거절 %s를 안내하고 조건을 새로고침한다", async (error, message) => {
    fetchMock.mockResolvedValue(Response.json({ ok: false, error }, { status: 409 }));
    const props = setup();
    fireEvent.click(screen.getByRole("button", { name: "길드장 승계" }));
    await waitFor(() => expect(props.setActing).toHaveBeenLastCalledWith(false));
    expect(props.setNotice).toHaveBeenCalledWith({ kind: "err", text: expect.stringContaining(message) });
    expect(props.onRefresh).toHaveBeenCalledTimes(1);
    expect(props.onGuildChanged).not.toHaveBeenCalled();
  });
  it("네트워크 오류를 표시하고 재시도를 허용한다", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const props = setup();
    fireEvent.click(screen.getByRole("button", { name: "길드장 승계" }));
    await waitFor(() => expect(props.setActing).toHaveBeenLastCalledWith(false));
    expect(props.setNotice).toHaveBeenCalledWith({ kind: "err", text: expect.stringContaining("잠시 후") });
  });
});
