import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
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

    expect(infernal).toContain("ui-infernal-ember--e");
    expect(oceanic).toContain("ui-oceanic-bubble--e");
    expect(verdant).not.toContain("ui-verdant-decoration-frame");
    expect(verdant).toContain("ui-verdant-leaf--fall-a");
    expect(verdant).toContain("ui-verdant-leaf--fall-e");
    expect(rose).toContain("ui-rose-petal--e");
    expect(prismatic).toBe("");
  });

  it("축소 아바타에서는 compact 변형을 표시한다", () => {
    const html = renderToStaticMarkup(
      <ProfileDecorationMotion profileBorder="verdant" compact />,
    );

    expect(html).toContain("ui-profile-decoration-motion--compact");
    expect(html).toContain("ui-profile-decoration-motion--verdant");
    expect(html).toContain('aria-hidden="true"');
  });
});
