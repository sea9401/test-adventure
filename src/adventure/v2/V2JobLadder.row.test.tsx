// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { V2JobLadder } from "./V2JobLadder";

afterEach(cleanup);

function renderLadder() {
  return render(
    <V2JobLadder
      level={1}
      currentJobName="모험가"
      currentJobId="none"
      atLevelCap={false}
      revisitExpedited={false}
      rejobRequiredLevel={100}
      jobs={[
        {
          id: "warrior",
          name: "견습 병사",
          tier: 1,
          unlocked: true,
          condition: "Lv 100 달성",
          bonus: "힘 +5",
        },
      ]}
      onChanged={() => {}}
    />,
  );
}

describe("성장의 신전 직업 행", () => {
  it("기본으로 이름·숙련도·해금 조건만 보이고 나머지는 펼쳐서 본다", () => {
    const { container } = renderLadder();

    expect(screen.getByText(/해금 조건 · Lv 100 달성/)).toBeTruthy();
    expect(screen.queryByText(/직업 보너스 · 힘 \+5/)).toBeNull();

    const toggle = screen.getByRole("button", { name: /견습 병사 자세히/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(/직업 보너스 · 힘 \+5/)).toBeTruthy();
    expect(container.innerHTML).not.toMatch(/text-\[1[01]px\]/);
  });
});
