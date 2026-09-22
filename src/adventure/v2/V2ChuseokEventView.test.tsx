// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChuseokEventContent } from "./V2ChuseokEventView";
import type { ChuseokState } from "../data/v2/chuseokEvent";
vi.mock("./GameStateProvider", () => ({ useGameIdentityState: () => ({ viewerGender: "male1", viewerName: "모험가" }) }));
vi.mock("./GameStateRefreshContext", () => ({ useRefreshGameState: () => vi.fn() }));
const state: ChuseokState = { ok: true, phase: "active", window: { startsAt: Date.parse("2026-09-22T18:00:00+09:00"), endsAt: Date.parse("2026-10-02T18:00:00+09:00") }, attendance: { todayKey: "2026-09-22", claimedCount: 0, claimedToday: false, complete: false, canClaim: true, nextReward: 5 }, raid: { stage: 1, hp: 50_000_000, maxHp: 100_000_000, myDamage: 100, attacksRemaining: 3, participantCount: 2 } };
afterEach(cleanup);
describe("추석 이벤트 화면", () => {
  it("출석을 기본 탭으로 열고 복주머니 탭으로 전환하면 토벌과 결과만 표시한다", () => {
    const onAttend = vi.fn(); const onAttack = vi.fn();
    render(<ChuseokEventContent state={state} busy={null} onAttend={onAttend} onAttack={onAttack} raidResult={<p>전투 결과 확인</p>} />);
    expect(screen.getByRole("tab", { name: "출석" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getAllByText(/일차$/)).toHaveLength(7);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText("전투 결과 확인")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /출석 보상 받기/ }));
    fireEvent.click(screen.getByRole("tab", { name: "복주머니" }));
    expect(screen.queryByText("한가위 7일 출석")).toBeNull();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("50000000");
    expect(screen.getByText("전투 결과 확인")).toBeTruthy();
    expect(screen.getByRole("img", { name: "수채화로 그린 전통 추석 복주머니" }).getAttribute("src")).toContain("chuseok-lucky-bag.webp");
    fireEvent.click(screen.getByRole("button", { name: /복주머니 공격/ }));
    expect(onAttend).toHaveBeenCalledTimes(1); expect(onAttack).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("tab", { name: "출석" }));
    expect(screen.getAllByText(/일차$/)).toHaveLength(7);
    expect(screen.queryByText("전투 결과 확인")).toBeNull();
  });
  it.each(["pending", "ended"] as const)("%s 상태에서는 참여 버튼을 비활성화한다", (phase) => {
    render(<ChuseokEventContent state={{ ...state, phase, attendance: { ...state.attendance, canClaim: false } }} busy={null} onAttend={() => {}} onAttack={() => {}} />);
    for (const button of screen.getAllByRole("button")) expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("tab", { name: "복주머니" }));
    expect((screen.getByRole("button", { name: /복주머니 공격/ }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("이미 받은 출석과 소진된 공격 횟수를 화면에 반영한다", () => {
    render(<ChuseokEventContent state={{ ...state, attendance: { ...state.attendance, claimedCount: 1, claimedToday: true, canClaim: false }, raid: { ...state.raid, attacksRemaining: 0 } }} busy={null} onAttend={() => {}} onAttack={() => {}} />);
    expect((screen.getByRole("button", { name: "오늘 출석 완료" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("tab", { name: "복주머니" }));
    expect((screen.getByRole("button", { name: /오늘 공격 완료/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
