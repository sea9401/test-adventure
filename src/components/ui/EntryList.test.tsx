import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { EntryList, EntryRow, EntryTile, EntryTileGrid } from "./EntryList";

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

describe("EntryTileGrid", () => {
  it("메뉴 타일을 휴대폰 두 줄 격자로 놓고 타일마다 상자를 둔다", () => {
    const html = renderToStaticMarkup(
      <EntryTileGrid>
        <EntryTile icon={<span data-icon>A</span>} title="치료소" onClick={vi.fn()} />
        <EntryTile icon={<span data-icon>B</span>} title="은행" onClick={vi.fn()} />
      </EntryTileGrid>,
    );

    expect(html).toContain("grid-cols-2");
    expect(count(html, "ui-surface-card")).toBe(2);
    expect(count(html, "<button")).toBe(2);
    expect(count(html, "data-icon")).toBe(2);
    expect(html).not.toContain("<img");
  });

  it("이름이 길면 자르지 않고 줄을 바꾼다", () => {
    const html = renderToStaticMarkup(
      <EntryTile icon={<span />} title="생활 의뢰·조합 작업장" onClick={vi.fn()} />,
    );

    expect(html).toContain("생활 의뢰·조합 작업장");
    expect(html).not.toContain("truncate");
  });

  it("상태 글을 이름 아래에 보여 주고, 할 일이 있을 때만 점과 강조 색을 쓴다", () => {
    const idle = renderToStaticMarkup(
      <EntryTile
        icon={<span />}
        title="주방"
        status={{ text: "일일 납품 0 / 2", actionable: false }}
        onClick={vi.fn()}
      />,
    );
    const actionable = renderToStaticMarkup(
      <EntryTile
        icon={<span />}
        title="모험가 농장"
        status={{ text: "수확 가능", actionable: true }}
        onClick={vi.fn()}
      />,
    );

    expect(idle).toContain("일일 납품 ");
    expect(idle).toContain("0 / 2");
    expect(idle).not.toContain("data-entry-tile-dot");
    expect(idle).not.toContain("처리 가능한 항목 있음");
    expect(actionable).toContain("수확 가능");
    expect(actionable).toContain("data-entry-tile-dot");
    expect(actionable).toContain("text-orange-700");
    expect(actionable).toContain("처리 가능한 항목 있음");
  });

  it("진행 숫자는 줄 사이에서 갈라지지 않게 묶는다", () => {
    const html = renderToStaticMarkup(
      <EntryTile
        icon={<span />}
        title="주방"
        status={{ text: "일일 납품 · 0 / 3", actionable: false }}
        onClick={vi.fn()}
      />,
    );

    expect(html).toContain('<span class="whitespace-nowrap">0 / 3</span>');
    expect(html).toContain("break-keep");
  });

  it("상태가 없으면 설명을, 잠겼으면 다른 글 대신 해금 조건과 자물쇠를 보여 준다", () => {
    const described = renderToStaticMarkup(
      <EntryTile icon={<span />} title="문장" description="문장 장착과 합성" onClick={vi.fn()} />,
    );
    const locked = renderToStaticMarkup(
      <EntryTile
        icon={<span />}
        title="개척 노드"
        description="탐사망 강화"
        status={{ text: "새 노드", actionable: true }}
        locked="Lv 100에 열림"
        onClick={vi.fn()}
      />,
    );

    expect(described).toContain("문장 장착과 합성");
    expect(locked).toContain("Lv 100에 열림");
    expect(locked).not.toContain("탐사망 강화");
    expect(locked).not.toContain("새 노드");
    expect(locked).not.toContain("data-entry-tile-dot");
    expect(locked).toContain("data-locked");
    expect(locked).not.toMatch(/\bopacity-\d/);
  });
});
