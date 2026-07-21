import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GameIcon } from "@/adventure/v2/GameIcon";
import {
  CUSTOM_GAME_ICON_META,
  CUSTOM_GAME_ICON_NAMES,
  CustomGameIcon,
  CustomGameIconTile,
} from "./CustomGameIcon";

describe("자체 제작 게임 SVG 아이콘", () => {
  it("대표 아이콘 12종을 제공한다", () => {
    expect(CUSTOM_GAME_ICON_NAMES).toHaveLength(12);
    expect(CUSTOM_GAME_ICON_NAMES).toEqual(
      expect.arrayContaining(["Sword", "Coins", "Plant", "Bell", "Gear"]),
    );
  });

  it("SVG 자체에는 타일 배경을 넣지 않는다", () => {
    const html = renderToStaticMarkup(
      <CustomGameIcon name="Coins" size={28} />,
    );
    expect(html).toContain('viewBox="0 0 64 64"');
    expect(html).toContain("#ffca28");
    expect(html).not.toContain("#4c158f");
    expect(html).not.toContain("<rect width=\"64\" height=\"64\"");
  });

  it("카테고리별 타일 배경을 UI 래퍼에서 적용한다", () => {
    const coinTile = renderToStaticMarkup(
      <CustomGameIconTile name="Coins" />,
    );
    const plantTile = renderToStaticMarkup(
      <CustomGameIconTile name="Plant" />,
    );
    expect(coinTile).toContain("bg-amber-100");
    expect(plantTile).toContain("bg-emerald-100");
    expect(
      new Set(
        CUSTOM_GAME_ICON_NAMES.map(
          (name) => CUSTOM_GAME_ICON_META[name].tileClass,
        ),
      ).size,
    ).toBeGreaterThanOrEqual(10);
  });

  it("중앙 GameIcon 호출도 자체 SVG로 전환한다", () => {
    const html = renderToStaticMarkup(<GameIcon name="Shield" size={24} />);
    expect(html).toContain('viewBox="0 0 64 64"');
    expect(html).toContain("#5ba7ff");
    expect(html).not.toContain("phosphor");
  });
});
