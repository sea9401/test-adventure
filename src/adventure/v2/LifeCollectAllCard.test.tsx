// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LifeCollectAllCard } from "./LifeCollectAllCard";

afterEach(cleanup);

describe("LifeCollectAllCard", () => {
  it("버튼을 누르면 한 번에 정산하고 단계별 결과를 보여 준다", async () => {
    let finish!: () => void;
    const run = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<typeof import("./lifeCollectAll").runLifeCollectAll>>>((resolve) => {
          finish = () =>
            resolve([
              { area: "gathering", tone: "ok", text: "자동 채광: 철광석 +430. 철 광맥에서 다시 시작했습니다." },
              { area: "farm", tone: "info", text: "밭: 수확할 칸이 없습니다." },
              { area: "ranch", tone: "error", text: "목장: 수거하지 못했습니다." },
            ]);
        }),
    );
    const onDone = vi.fn();
    render(<LifeCollectAllCard run={run} onDone={onDone} />);

    expect(screen.queryByRole("list", { name: "정산 결과" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "한 번에 정산" }));
    // 진행 중에는 다시 누를 수 없다.
    expect((screen.getByRole("button", { name: "정산 중..." }) as HTMLButtonElement).disabled).toBe(true);
    finish();

    const results = await screen.findByRole("list", { name: "정산 결과" });
    expect(within(results).getAllByRole("listitem")).toHaveLength(3);
    expect(within(results).getByText("밭: 수확할 칸이 없습니다.")).toBeTruthy();
    expect(within(results).getByText("목장: 수거하지 못했습니다.").className).toContain("rose");
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(run).toHaveBeenCalledTimes(1);
  });
});
