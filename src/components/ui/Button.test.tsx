import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button, buttonClassName } from "./Button";
import { BackButton } from "./BackButton";

describe("Button 비동기 로딩 상태", () => {
  it("정상 라벨의 폭을 유지한 채 스피너와 접근성 상태를 표시한다", () => {
    const html = renderToStaticMarkup(
      <Button loading loadingLabel="보상 수령 중" variant="warning">
        받기
      </Button>,
    );

    expect(html).toContain("disabled");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-label="보상 수령 중"');
    expect(html).toContain('data-button-content="true"');
    expect(html).toContain("invisible");
    expect(html).toContain(">받기</span>");
    expect(html).toContain('data-button-spinner="true"');
  });

  it("평상시에는 기존 라벨과 활성 상태를 그대로 유지한다", () => {
    const html = renderToStaticMarkup(<Button>이동</Button>);

    expect(html).toContain(">이동</span>");
    expect(html).not.toMatch(/<button[^>]*\sdisabled(?:=|\s|>)/);
    expect(html).not.toContain("aria-busy");
    expect(html).not.toContain("data-button-spinner");
  });
});

describe("Button 모바일 터치 영역", () => {
  it.each([
    ["xs", "min-h-10", "sm:min-h-7"],
    ["sm", "min-h-10", "sm:min-h-8"],
    ["md", "min-h-11", "sm:min-h-10"],
  ] as const)("%s 크기의 모바일·데스크톱 최소 높이를 유지한다", (size, mobile, desktop) => {
    const html = renderToStaticMarkup(<Button size={size}>동작</Button>);

    expect(html).toContain(mobile);
    expect(html).toContain(desktop);
  });

  it("뒤로 가기는 모바일에서 44px 높이를 확보한다", () => {
    const html = renderToStaticMarkup(<BackButton onClick={() => {}} />);

    expect(html).toContain("min-h-11");
    expect(html).toContain("sm:min-h-8");
  });

  it("큰 버튼과 아이콘 버튼도 모바일 44px 터치 영역을 유지한다", () => {
    const large = renderToStaticMarkup(<Button size="lg">대표 행동</Button>);
    const icon = renderToStaticMarkup(
      <Button size="icon" aria-label="메뉴">
        ☰
      </Button>,
    );

    expect(large).toContain("min-h-11");
    expect(icon).toContain("size-11");
  });
});

describe("Button 디자인 계층", () => {
  it("soft 변형과 링크용 클래스가 같은 시각 언어를 사용한다", () => {
    const soft = renderToStaticMarkup(
      <Button variant="soft">홈 편집</Button>,
    );

    expect(soft).toContain("bg-violet-50");
    expect(soft).toContain("text-violet-700");
    expect(buttonClassName({ variant: "primary", size: "md" })).toContain(
      "bg-violet-600",
    );
  });
});
