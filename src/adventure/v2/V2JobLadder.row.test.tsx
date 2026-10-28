// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { tier7AdvancementStatus } from "@/adventure/data/v2/tier7Advancement";
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

  it("7차 직업은 펼치면 최초 전직 때 SP를 받는다고 알려 준다", () => {
    const tier7Advancement = tier7AdvancementStatus({
      targetJobId: "shadowblade",
      currentJobId: "swordsaint",
      currentLevel: 100,
      jobCumLevel: { swordsaint: 100_000, blackmoon: 100_000 },
      jobHistory: [],
      materials: {},
    })!;
    render(
      <V2JobLadder
        level={100}
        currentJobName="검성"
        currentJobId="swordsaint"
        atLevelCap
        revisitExpedited={false}
        rejobRequiredLevel={100}
        jobs={[
          {
            id: "shadowblade",
            name: "무영검신",
            tier: 7,
            unlocked: true,
            condition: "검성 숙련도 100000, 흑월 숙련도 100000",
            tier7Advancement,
          },
        ]}
        onChanged={() => {}}
      />,
    );

    expect(screen.queryByText("SP +1은 최초 전직에 성공할 때 받습니다.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /무영검신 자세히/ }));
    expect(screen.getByText("SP +1은 최초 전직에 성공할 때 받습니다.")).toBeTruthy();
  });
  it("7차 직업 행은 숙련도 외의 최초 전직 조건과 진행도도 보여 준다", () => {
    const tier7Advancement = tier7AdvancementStatus({
      targetJobId: "skyascendant",
      currentJobId: "warlord",
      currentLevel: 100,
      jobCumLevel: { heavenlybow: 100_024, celestialdragon: 100_000 },
      jobHistory: [],
      materials: { v2_storm_origin_fragment: 16 },
    })!;
    render(
      <V2JobLadder
        level={100}
        currentJobName="무장"
        currentJobId="warlord"
        atLevelCap
        revisitExpedited={false}
        rejobRequiredLevel={100}
        jobs={[
          {
            id: "skyascendant",
            name: "비천무신",
            tier: 7,
            unlocked: false,
            condition: "천궁 숙련도 100000, 천룡권성 숙련도 100000",
            tier7Advancement,
          },
        ]}
        onChanged={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /조건 부족/ }));
    expect(
      screen.getByText(
        /해금 조건 · 천궁 숙련도 100000, 천룡권성 숙련도 100000, 현재 직업 천궁 또는 천룡권성 Lv 100, 폭풍 기원의 파편 30개/,
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /비천무신 자세히/ }));
    expect(screen.getByText("16 / 30")).toBeTruthy();
    expect(screen.getByText("SP +1은 최초 전직에 성공할 때 받습니다.")).toBeTruthy();
  });
});
