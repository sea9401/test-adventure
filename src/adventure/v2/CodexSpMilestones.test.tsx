import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CodexSpMilestones, codexNextSpLabel } from "./CodexSpMilestones";

describe("codexNextSpLabel", () => {
  it("다음 SP까지 남은 수와 기준 수를 함께 보여 준다", () => {
    expect(codexNextSpLabel(39, [5, 15, 35, 65], "신규 장비 추가 시 확장")).toBe(
      "다음 SP까지 26종 (65종 달성)",
    );
  });

  it("모든 단계를 받으면 완료 문구를 쓴다", () => {
    expect(codexNextSpLabel(70, [5, 15, 35, 65], "신규 장비 추가 시 확장")).toBe(
      "신규 장비 추가 시 확장",
    );
  });
});

describe("CodexSpMilestones", () => {
  it("받은 단계 수와 단계별 상태를 표시한다", () => {
    const html = renderToStaticMarkup(
      <CodexSpMilestones count={39} milestones={[5, 15, 35, 65, 100]} />,
    );
    expect(html).toContain("SP 단계 3/5");
    expect(html).toContain('data-sp-milestone="earned"');
    expect(html.match(/data-sp-milestone="earned"/g)).toHaveLength(3);
    expect(html.match(/data-sp-milestone="next"/g)).toHaveLength(1);
    expect(html.match(/data-sp-milestone="locked"/g)).toHaveLength(1);
  });

  it("단계가 없으면 아무것도 그리지 않는다", () => {
    expect(
      renderToStaticMarkup(<CodexSpMilestones count={3} milestones={[]} />),
    ).toBe("");
  });
});
