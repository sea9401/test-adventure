import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { EntryList, EntryRow } from "./EntryList";

function count(html: string, needle: string) {
  return html.split(needle).length - 1;
}

describe("EntryList", () => {
  it("메뉴 행들을 카드 하나 안에서 구분선으로 나눈다", () => {
    const html = renderToStaticMarkup(
      <EntryList>
        <EntryRow icon={<span>A</span>} title="치료소" onClick={vi.fn()} />
        <EntryRow icon={<span>B</span>} title="은행" onClick={vi.fn()} />
      </EntryList>,
    );

    expect(count(html, "ui-surface-card")).toBe(1);
    expect(html).toContain("divide-y");
    expect(count(html, "<button")).toBe(2);
    expect(html).toContain("min-h-16");
  });

  it("그림이 있으면 장식용 썸네일을, 없으면 아이콘 타일을 보여 준다", () => {
    const withImage = renderToStaticMarkup(
      <EntryRow
        icon={<span data-icon>아이콘</span>}
        image="/images/ui/healingcenter.webp"
        title="치료소"
        onClick={vi.fn()}
      />,
    );
    const withIcon = renderToStaticMarkup(
      <EntryRow icon={<span data-icon>아이콘</span>} title="스킬" onClick={vi.fn()} />,
    );

    expect(withImage).toContain("<img");
    expect(withImage).toContain('alt=""');
    expect(withImage).toContain("healingcenter.webp");
    expect(withImage).not.toContain("data-icon");
    expect(withIcon).not.toContain("<img");
    expect(withIcon).toContain("data-icon");
  });

  it("설명이 있으면 제목 아래 한 줄로 줄여 보여 준다", () => {
    const html = renderToStaticMarkup(
      <EntryRow
        icon={<span />}
        title="문장"
        description="문장 장착과 합성"
        onClick={vi.fn()}
      />,
    );

    expect(html).toContain("문장 장착과 합성");
    expect(html).toContain("truncate");
  });
  it("잠긴 메뉴는 설명 대신 해금 조건과 자물쇠를 보여 주고 흐리게 하지 않는다", () => {
    const html = renderToStaticMarkup(
      <EntryRow icon={<span />} title="개척 노드" description="탐사망 강화" locked="Lv 100에 열림" onClick={vi.fn()} />,
    );

    expect(html).toContain("Lv 100에 열림");
    expect(html).not.toContain("탐사망 강화");
    expect(html).toContain("data-locked");
    expect(html).not.toMatch(/\bopacity-\d/);
  });
});
