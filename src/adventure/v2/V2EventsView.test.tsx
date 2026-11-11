// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import EventsPage from "@/app/(game)/settings/events/page";
import { V2EventsView } from "./V2EventsView";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("./useAttendanceReminder", () => ({ useAttendanceReminder: () => false }));
vi.mock("./V2AttendanceView", () => ({ V2AttendanceView: () => <div>출석 화면</div> }));
vi.mock("./V2ReferralView", () => ({ V2ReferralView: () => <div>홍보 화면</div> }));
vi.mock("./V2CouponView", () => ({ V2CouponView: () => <div>쿠폰 화면</div> }));
vi.mock("./V2WinterBoardView", () => ({ V2WinterBoardView: () => <div>겨울 화면</div> }));
const winterPending = vi.hoisted(() => ({ value: 0 }));
vi.mock("./useWinterBoardReminder", () => ({
  useWinterBoardReminder: () => winterPending.value,
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  winterPending.value = 0;
});

describe("이벤트 화면", () => {
  it("겨울 이벤트 기간에는 출석 체크 다음에 겨울 이벤트 탭을 보여 준다", () => {
    vi.useFakeTimers({ now: new Date("2026-11-20T12:00:00+09:00") });
    render(<V2EventsView />);

    const tabs = screen.getAllByRole("tab").map((tab) => tab.textContent);
    expect(tabs).toEqual(["출석 체크", "겨울 이벤트", "게임 홍보", "쿠폰 등록"]);
    expect(screen.queryByText(/추석/)).toBeNull();
  });

  it("겨울 이벤트가 끝나면 탭을 숨기고 예전 링크는 출석 체크로 연다", async () => {
    vi.useFakeTimers({ now: new Date("2026-12-15T00:00:01+09:00") });
    render(<V2EventsView initialTab="winter" />);

    const tabs = screen.getAllByRole("tab").map((tab) => tab.textContent);
    expect(tabs).toEqual(["출석 체크", "게임 홍보", "쿠폰 등록"]);
    expect(screen.getByText("출석 화면")).toBeTruthy();
  });

  it("겨울 이벤트 링크는 겨울 이벤트 탭으로 연다", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-20T12:00:00+09:00") });
    const element = await EventsPage({ searchParams: Promise.resolve({ tab: "winter" }) });
    expect(element.props.initialTab).toBe("winter");
    render(<V2EventsView initialTab="winter" />);
    expect(screen.getByText("겨울 화면")).toBeTruthy();
  });

  it("굴릴 주사위가 있으면 겨울 이벤트 탭에 알림을 붙인다", () => {
    vi.useFakeTimers({ now: new Date("2026-11-20T12:00:00+09:00") });
    winterPending.value = 2;
    render(<V2EventsView />);
    expect(screen.getByRole("tab", { name: /겨울 이벤트/ }).textContent).toContain("!");
  });

  it("예전 추석 이벤트 링크는 출석 체크 탭으로 연다", async () => {
    const element = await EventsPage({ searchParams: Promise.resolve({ tab: "chuseok" }) });
    expect(element.props.initialTab).toBe("attendance");
  });
});
