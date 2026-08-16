import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CultivationActions,
  CultivationJobSelector,
  CultivationMaxConfirmDialog,
  cultivationCompletionMessage,
  cultivationRequestInit,
  visitedCultivationJobOptions,
} from "./CultivationActions";

describe("수행 액션", () => {
  it("기존 1회 버튼과 가능한 만큼 버튼을 함께 노출한다", () => {
    const html = renderToStaticMarkup(
      <CultivationActions
        canCultivate
        busy={false}
        isLifestyleJob={false}
        onCultivate={() => undefined}
        onCultivateMax={() => undefined}
      />,
    );
    const text = html.replace(/<[^>]+>/g, "");

    expect(text).toContain("수행");
    expect(text).toContain("가능한 만큼 수행");
    expect(html).not.toContain('disabled=""');
    expect(html).toContain('aria-haspopup="dialog"');
  });

  it("처리 중에도 모바일 반복 탭 위치와 버튼 문구를 유지한다", () => {
    const html = renderToStaticMarkup(
      <CultivationActions
        canCultivate={false}
        busy
        isLifestyleJob={false}
        onCultivate={() => undefined}
        onCultivateMax={() => undefined}
      />,
    );
    const text = html.replace(/<[^>]+>/g, "");

    expect(html).toContain(
      "grid-cols-[minmax(0,1fr)_minmax(0,2fr)]",
    );
    expect(text).toContain("수행");
    expect(text).toContain("가능한 만큼 수행");
    expect(html.match(/aria-busy="true"/g)).toHaveLength(2);
    expect(html).not.toContain("처리 중…");
    expect(html).not.toContain("수행 중…");
  });

  it("가능한 만큼 수행은 별도 확인 대화상자에서 확정한다", () => {
    const html = renderToStaticMarkup(
      <CultivationMaxConfirmDialog
        busy={false}
        onConfirm={() => undefined}
        onClose={() => undefined}
      />,
    );
    const text = html.replace(/<[^>]+>/g, "");

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain(
      'aria-labelledby="cultivation-max-confirm-title"',
    );
    expect(text).toContain("가능한 만큼 한 번에 수행할까요?");
    expect(text).toContain("가능한 만큼 수행 확정");
  });

  it("수행할 수 없으면 두 버튼을 모두 비활성화한다", () => {
    const html = renderToStaticMarkup(
      <CultivationActions
        canCultivate={false}
        busy={false}
        isLifestyleJob={false}
        onCultivate={() => undefined}
        onCultivateMax={() => undefined}
      />,
    );

    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });

  it("일괄 수행 결과를 횟수·소모·특별 결과로 요약한다", () => {
    expect(
      cultivationCompletionMessage(
        {
          performed: 12,
          spent: 345,
          greatSuccesses: 2,
          awakenings: 1,
          redistributedGrowthPoints: 8,
          hasMore: false,
          mult: 1,
        },
        "max",
        0,
      ),
    ).toBe(
      "✓ 수행 12회 완료 (숙달 포인트 -345) · 대성공 2회 · 각성 1회 · 성장 재분배 +8",
    );
  });

  it("가능한 만큼 수행은 mode=max JSON 요청을 만든다", () => {
    const init = cultivationRequestInit("max", "fortressknight");

    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(String(init.body))).toEqual({
      mode: "max",
      targetJobId: "fortressknight",
    });
  });

  it("1회 수행도 선택한 직업 ID를 JSON 요청으로 만든다", () => {
    const init = cultivationRequestInit("once", "fortressknight");

    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(String(init.body))).toEqual({
      targetJobId: "fortressknight",
    });
  });

  it("선택한 직업 이름을 수행 완료 문구에 표시한다", () => {
    expect(
      cultivationCompletionMessage(
        { performed: 1, spent: 8, mult: 1 },
        "once",
        8,
        "성채기사",
      ),
    ).toBe("✓ 성채기사 수행 완료 (숙달 포인트 -8)");
  });

  it("요청 상한 도달 시 추가 수행 가능을 알린다", () => {
    const message = cultivationCompletionMessage(
      {
        performed: 10_000,
        spent: 1_000_000,
        hasMore: true,
      },
      "max",
      0,
    );

    expect(message).toContain("남은 포인트로 추가 수행 가능");
  });

  it("기존 1회 수행은 특별 결과를 배수로 표시한다", () => {
    expect(
      cultivationCompletionMessage(
        {
          performed: 1,
          spent: 8,
          mult: 5,
          redistributedGrowthPoints: 4,
        },
        "once",
        0,
      ),
    ).toBe(
      "✓ 수행 완료 (숙달 포인트 -8) · 각성 ×5! · 성장 재분배 +4",
    );
  });
});

describe("수행 성장 직업 선택", () => {
  const options = [
    { id: "mage", name: "견습 마법사", summary: "지능 +2 · 정신 +2" },
    { id: "fortressknight", name: "성채기사", summary: "활력 +4 · 힘 +2" },
  ];

  it("전달받은 방문 전투직과 선택 직업의 성장 수치를 표시한다", () => {
    const html = renderToStaticMarkup(
      <CultivationJobSelector
        options={options}
        value="fortressknight"
        busy={false}
        onChange={() => undefined}
      />,
    );

    expect(html).toContain("수행 성장 직업");
    expect(html).toContain('<option value="mage">견습 마법사</option>');
    expect(html).toContain(
      '<option value="fortressknight" selected="">성채기사</option>',
    );
    expect(html).toContain("활력 +4 · 힘 +2");
    expect(html).toContain("전직한 적이 있는 전투직만 선택할 수 있습니다.");
  });

  it("수행 중에는 직업 선택을 비활성화한다", () => {
    const html = renderToStaticMarkup(
      <CultivationJobSelector
        options={options}
        value="mage"
        busy
        onChange={() => undefined}
      />,
    );

    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-busy="true"');
  });

  it("방문한 전투직만 수행 선택지로 만든다", () => {
    expect(
      visitedCultivationJobOptions([
        { id: "mage", name: "견습 마법사", visited: true },
        { id: "fortressknight", name: "성채기사", visited: true },
        { id: "swordsaint", name: "검성", visited: false },
        { id: "fisher", name: "낚시꾼", visited: true },
      ]),
    ).toEqual([
      { id: "mage", name: "견습 마법사", summary: "지능 +2 · 정신 +2" },
      { id: "fortressknight", name: "성채기사", summary: "활력 +4 · 힘 +2" },
    ]);
  });
});
