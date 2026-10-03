// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const reload = vi.hoisted(() => vi.fn());

vi.mock("@/adventure/v2/coop/useCoopBossState", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/adventure/v2/coop/useCoopBossState")
  >();
  return {
    ...actual,
    useCoopListState: () => ({
      scrolls: 99,
      sessions: [],
      claimables: [],
      busy: false,
      loaded: true,
      notice: null,
      lastReward: null,
      refresh: vi.fn(async () => undefined),
      summon: vi.fn(async () => null),
      claim: vi.fn(async () => undefined),
    }),
  };
});

vi.mock("./useCoopManagement", () => ({
  useCoopManagement: () => ({
    autoFreeSupport: false,
    ready: false,
    loading: false,
    busy: false,
    notice: null,
    reload,
    saveAutoFreeSupport: vi.fn(),
    applyBulk: vi.fn(),
  }),
}));

import { V2CoopBossListView } from "./V2CoopBossListView";

afterEach(cleanup);

describe("토벌 설정을 불러오지 못했을 때", () => {
  it("접힌 설정 밖에서 소환이 막힌 이유와 다시 불러오기를 보여 준다", () => {
    render(<V2CoopBossListView onOpenSession={() => {}} onBack={() => {}} />);

    expect(screen.getByText("토벌 설정을 불러오지 못해 지금은 소환할 수 없습니다.")).toBeTruthy();
    const outside = screen
      .getAllByRole("button", { name: "설정 다시 불러오기" })
      .find((button) => !button.closest("details"));
    expect(outside).toBeTruthy();

    fireEvent.click(outside!);
    expect(reload).toHaveBeenCalled();
  });
});
