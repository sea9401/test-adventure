import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CosmeticAvatar } from "./CosmeticAvatar";
import { ProfileDecorationMotion } from "./ProfileDecorationMotion";

describe("ProfileDecorationMotion", () => {
  it("업화·심해·세계수·장미에 고유 입자를 렌더링한다", () => {
    const infernal = renderToStaticMarkup(
      <ProfileDecorationMotion profileBorder="infernal" />,
    );
    const oceanic = renderToStaticMarkup(
      <ProfileDecorationMotion profileBorder="oceanic" />,
    );
    const verdant = renderToStaticMarkup(
      <ProfileDecorationMotion profileBorder="verdant" />,
    );
    const rose = renderToStaticMarkup(
      <ProfileDecorationMotion profileBorder="rose" />,
    );
    const prismatic = renderToStaticMarkup(
      <ProfileDecorationMotion profileBorder="prismatic" />,
    );
    const sapphire = renderToStaticMarkup(
      <ProfileDecorationMotion profileBorder="sapphire" />,
    );

    expect(infernal).toContain("ui-infernal-ember--h");
    expect(oceanic).toContain("ui-oceanic-bubble--h");
    expect(verdant).not.toContain("ui-verdant-decoration-frame");
    expect(verdant).toContain("ui-verdant-leaf--fall-a");
    expect(verdant).toContain("ui-verdant-leaf--fall-h");
    expect(rose).toContain("ui-rose-petal--h");
    expect(prismatic).toContain("ui-profile-decoration-motion--prismatic");
    expect(prismatic).not.toContain("ui-infernal-ember");
    expect(sapphire).toBe("");
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
