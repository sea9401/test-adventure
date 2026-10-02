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

afterEach(cleanup);

describe("이벤트 화면", () => {
  it("끝난 추석 이벤트 탭 없이 상시 이벤트만 보여 준다", () => {
    render(<V2EventsView />);

    const tabs = screen.getAllByRole("tab").map((tab) => tab.textContent);
    expect(tabs).toEqual(["출석 체크", "게임 홍보", "쿠폰 등록"]);
    expect(screen.queryByText(/추석/)).toBeNull();
  });

  it("예전 추석 이벤트 링크는 출석 체크 탭으로 연다", async () => {
    const element = await EventsPage({ searchParams: Promise.resolve({ tab: "chuseok" }) });
    expect(element.props.initialTab).toBe("attendance");
  });
});
