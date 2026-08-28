import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  PLUMP_GAME_ICON_NAMES,
  PlumpGameIcon,
} from "./PlumpGameIcon";

describe("Plump Solid 게임 아이콘", () => {
  it("승인된 30종을 동일한 SVG 계약으로 렌더링한다", () => {
    expect(PLUMP_GAME_ICON_NAMES).toHaveLength(30);

    for (const name of PLUMP_GAME_ICON_NAMES) {
      const html = renderToStaticMarkup(
        <PlumpGameIcon name={name} size={24} />,
      );

      expect(html).toContain('viewBox="0 0 64 64"');
      expect(html).toContain(`data-plump-icon="${name}"`);
      expect(html).toContain("#fff");
      expect(html).not.toMatch(/stroke="(?!#fff)/);
      expect(html).not.toMatch(/filter=|linearGradient|radialGradient/);
    }
  });

  it("제목이 있으면 보조 기술에 이름을 제공한다", () => {
    const html = renderToStaticMarkup(
      <PlumpGameIcon name="salt" title="소금" />,
    );

    expect(html).toContain('role="img"');
    expect(html).toContain("<title>소금</title>");
    expect(html).not.toContain('aria-hidden="true"');
  });

  it("제목이 없으면 장식 아이콘으로 숨기고 사용자 스타일을 보존한다", () => {
    const html = renderToStaticMarkup(
      <PlumpGameIcon
        name="battle_node"
        mirrored
        size="1.25rem"
        className="battle-icon"
        style={{ rotate: "5deg" }}
      />,
    );

    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('class="battle-icon"');
    expect(html).toContain("scaleX(-1)");
    expect(html).toContain("rotate:5deg");
  });
});
