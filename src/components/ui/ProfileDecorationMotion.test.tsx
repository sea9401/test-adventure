import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProfileDecorationMotion } from "./ProfileDecorationMotion";

describe("ProfileDecorationMotion", () => {
  it("세계수에만 다층 잎사귀 연출을 렌더링한다", () => {
    const verdant = renderToStaticMarkup(
      <ProfileDecorationMotion profileBorder="verdant" />,
    );
    const oceanic = renderToStaticMarkup(
      <ProfileDecorationMotion profileBorder="oceanic" />,
    );

    expect(verdant).toContain("ui-verdant-decoration-frame");
    expect(verdant).toContain("ui-verdant-leaf--fall-c");
    expect(oceanic).toBe("");
  });

  it("축소 아바타에서는 compact 변형을 표시한다", () => {
    const html = renderToStaticMarkup(
      <ProfileDecorationMotion profileBorder="verdant" compact />,
    );

    expect(html).toContain("ui-verdant-decoration-motion--compact");
    expect(html).toContain('aria-hidden="true"');
  });
});
