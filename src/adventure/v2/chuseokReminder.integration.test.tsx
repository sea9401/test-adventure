// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { V2SettingsMenu } from "./V2SettingsMenu";
import { V2EventsView } from "./V2EventsView";
import { ChuseokEventContent } from "./V2ChuseokEventView";
import type { ChuseokState } from "../data/v2/chuseokEvent";
import { setChuseokReminder } from "./useChuseokReminder";

const monthly = vi.hoisted(() => ({ pending: false }));
vi.mock("./useAttendanceReminder", () => ({ useAttendanceReminder: () => monthly.pending }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("./V2CouponView", () => ({ V2CouponView: () => null }));
vi.mock("./GameStateProvider", () => ({ useGameIdentityState: () => ({ viewerName: "모험가" }) }));
vi.mock("./GameStateRefreshContext", () => ({ useRefreshGameState: () => vi.fn() }));

const state: ChuseokState = {
  ok: true, phase: "active",
  window: { startsAt: 0, endsAt: Date.parse("2099-01-01T00:00:00Z") },
  attendance: { todayKey: "2026-09-23", claimedCount: 0, claimedToday: false, complete: false, canClaim: true, nextReward: 5 },
  raid: { stage: 1, hp: 100_000_000, maxHp: 100_000_000, myDamage: 0, attacksRemaining: 3, participantCount: 0 },
};

beforeEach(() => {
  monthly.pending = false;
  setChuseokReminder(state);
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url === "/api/v2/events/chuseok"
    ? Response.json(state) : Response.json({}, { status: 403 })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("추석 참여 알림 표시", () => {
  it("월간 출석이 끝나도 추석 참여가 남으면 메뉴와 이벤트 링크에 알린다", async () => {
    render(<V2SettingsMenu />);
    const menu = await screen.findByRole("button", { name: /메뉴.*추석 이벤트 참여 가능/ });
    fireEvent.click(menu);
    expect(screen.getByRole("link", { name: /이벤트.*추석 이벤트 참여 가능/ })).toBeTruthy();
  });

  it("이벤트 화면의 추석 탭에 알리고 월간 출석에는 표시하지 않는다", async () => {
    render(<V2EventsView initialTab="coupon" />);
    await waitFor(() => expect(within(screen.getByRole("tab", { name: /추석/ })).getByLabelText("추석 이벤트 참여 가능")).toBeTruthy());
    expect(within(screen.getByRole("tab", { name: "출석 체크" })).queryByText("!")).toBeNull();
  });

  it("추석 참여를 마치면 메뉴와 추석 탭에서 함께 꺼진다", async () => {
    render(<><V2SettingsMenu /><V2EventsView initialTab="coupon" /></>);
    await screen.findByRole("button", { name: /메뉴.*추석 이벤트 참여 가능/ });
    act(() => setChuseokReminder({ ...state, attendance: { ...state.attendance, canClaim: false }, raid: { ...state.raid, attacksRemaining: 0 } }));
    expect(screen.getByRole("button", { name: "메뉴" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "추석" })).toBeTruthy();
  });

  it("추석을 모두 마쳐도 월간 출석이 남으면 기존 알림을 유지한다", () => {
    monthly.pending = true;
    setChuseokReminder({ ...state, attendance: { ...state.attendance, canClaim: false }, raid: { ...state.raid, attacksRemaining: 0 } });
    render(<><V2SettingsMenu /><V2EventsView initialTab="coupon" /></>);
    fireEvent.click(screen.getByRole("button", { name: "메뉴, 오늘 출석 체크 필요" }));
    expect(screen.getByRole("link", { name: /이벤트.*오늘 출석 체크 필요/ })).toBeTruthy();
    expect(within(screen.getByRole("tab", { name: /출석 체크/ })).getByLabelText("오늘 출석 체크 필요")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "추석" })).toBeTruthy();
  });

  it("하위 탭은 각 활동을 완료할 때 자신의 알림을 지운다", () => {
    const props = { busy: null, onAttend: () => {}, onAttack: () => {} };
    const { rerender } = render(<ChuseokEventContent {...props} state={state} />);
    expect(screen.getByLabelText("추석 출석 보상 받기 가능")).toBeTruthy();
    expect(screen.getByLabelText("복주머니 공격 가능")).toBeTruthy();
    const attended = { ...state, attendance: { ...state.attendance, canClaim: false } };
    rerender(<ChuseokEventContent {...props} state={attended} />);
    expect(screen.queryByLabelText("추석 출석 보상 받기 가능")).toBeNull();
    expect(screen.getByLabelText("복주머니 공격 가능")).toBeTruthy();
    rerender(<ChuseokEventContent {...props} state={{ ...attended, raid: { ...state.raid, attacksRemaining: 0 } }} />);
    expect(screen.queryByLabelText("복주머니 공격 가능")).toBeNull();
  });

  it.each(["pending", "ended"] as const)("%s 이벤트는 하위 탭에 알리지 않는다", (phase) => {
    render(<ChuseokEventContent state={{ ...state, phase }} busy={null} onAttend={() => {}} onAttack={() => {}} />);
    expect(screen.queryByLabelText("추석 출석 보상 받기 가능")).toBeNull();
    expect(screen.queryByLabelText("복주머니 공격 가능")).toBeNull();
  });
});
