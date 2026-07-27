import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CosmeticAvatar } from "./CosmeticAvatar";
import { ProfileDecorationMotion } from "./ProfileDecorationMotion";

describe("ProfileDecorationMotion", () => {
  it("기본 입자형 테두리 8종에 고유 입자 10개를 렌더링한다", () => {
    const particleThemes = [
      ["prismatic", "ui-prismatic-glint"],
      ["infernal", "ui-infernal-ember"],
      ["oceanic", "ui-oceanic-bubble"],
      ["verdant", "ui-verdant-leaf"],
      ["obsidian", "ui-obsidian-cinder"],
      ["frozen", "ui-frozen-crystal"],
      ["rose", "ui-rose-petal"],
      ["royal", "ui-royal-mote"],
    ] as const;
    const sapphire = renderToStaticMarkup(
      <ProfileDecorationMotion profileBorder="sapphire" />,
    );

    for (const [profileBorder, particleClass] of particleThemes) {
      const html = renderToStaticMarkup(
        <ProfileDecorationMotion profileBorder={profileBorder} />,
      );
      expect(html).toContain(`ui-profile-decoration-motion--${profileBorder}`);
      expect(
        html.match(new RegExp(`class="${particleClass}(?: |")`, "g")),
      ).toHaveLength(10);
    }
    expect(sapphire).toBe("");
  });

  it("빙결에는 눈 결정과 가장자리 서리층을 렌더링한다", () => {
    const html = renderToStaticMarkup(
      <ProfileDecorationMotion profileBorder="frozen" />,
    );

    expect(html.match(/class="ui-frozen-crystal /g)).toHaveLength(10);
    expect(html.match(/class="ui-frozen-frost /g)).toHaveLength(2);
  });

  it("폭풍에는 빗줄기와 배경 번개를 렌더링한다", () => {
    const html = renderToStaticMarkup(
      <ProfileDecorationMotion profileBorder="storm" />,
    );

    expect(html.match(/class="ui-storm-rain /g)).toHaveLength(14);
    expect(html.match(/class="ui-storm-lightning /g)).toHaveLength(2);
    expect(html).not.toContain("ui-storm-spark");
  });

  it("천상에는 전설 전용 별자리 지도·유성·광륜을 렌더링한다", () => {
    const html = renderToStaticMarkup(
      <ProfileDecorationMotion profileBorder="celestial" />,
    );

    expect(html.match(/class="ui-celestial-star-map"/g)).toHaveLength(1);
    expect(html.match(/class="ui-celestial-comet /g)).toHaveLength(2);
    expect(html.match(/class="ui-celestial-halo"/g)).toHaveLength(1);
    expect(html).not.toContain("ui-celestial-star ");
  });

  it("초기 렌더링에서는 화면 교차 감지 대상 클래스를 표시한다", () => {
    const html = renderToStaticMarkup(
      <ProfileDecorationMotion profileBorder="verdant" />,
    );

    expect(html).toContain("ui-profile-decoration-motion--verdant");
    expect(html).toContain('aria-hidden="true"');
  });

  it("축소 아바타에는 정적인 테두리만 표시한다", () => {
    const html = renderToStaticMarkup(
      <CosmeticAvatar
        avatar="male1"
        name="모험가"
        profileBorder="verdant"
        width={44}
        sizes="44px"
      />,
    );

    expect(html).toContain("ui-profile-frame-static");
    expect(html).not.toContain("ui-profile-decoration-motion");
  });
});
