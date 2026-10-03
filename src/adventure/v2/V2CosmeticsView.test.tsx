import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CollectionLayout, CosmeticCard } from "./V2CosmeticsView";

const card = (owned: boolean, name: string) => (
  <CosmeticCard
    owned={owned}
    accessActive={owned}
    accessUntil={null}
    now={0}
    active={false}
    busy={false}
    onToggle={vi.fn()}
    title={name}
    rarity="common"
    detail="단색"
  />
);

describe("꾸미기 도감", () => {
  it("보유한 꾸미기를 먼저 보여 주고 미획득은 접기 안 작은 칸으로 모은다", () => {
    const html = renderToStaticMarkup(
      <CollectionLayout
        title="닉네임 꾸미기 도감"
        description="설명"
        items={[
          { key: "crimson", owned: false, node: card(false, "크림슨") },
          { key: "amber", owned: true, node: card(true, "앰버") },
          { key: "lime", owned: false, node: card(false, "라임") },
        ]}
      />,
    );

    expect(html.indexOf("앰버")).toBeLessThan(html.indexOf("크림슨"));
    expect(html).toMatch(/<details[^>]*>\s*<summary[^>]*>[\s\S]*?미획득 2종/);
    expect(html.indexOf("미획득 2종")).toBeLessThan(html.indexOf("크림슨"));
  });

  it("보유한 꾸미기가 없으면 얻는 방법을 안내한다", () => {
    const html = renderToStaticMarkup(
      <CollectionLayout
        title="배지 도감"
        description="설명"
        items={[{ key: "a", owned: false, node: card(false, "별") }]}
      />,
    );

    expect(html).toContain("아직 보유한 꾸미기가 없습니다");
    expect(html).toContain("미획득 1종");
  });

  it("미획득 칸에는 버튼을 두지 않는다", () => {
    const html = renderToStaticMarkup(card(false, "크림슨"));

    expect(html).toContain("크림슨");
    expect(html).not.toContain("<button");
    expect(html).not.toMatch(/text-\[1[01]px\]/);
  });
});
