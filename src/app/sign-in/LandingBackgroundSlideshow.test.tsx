import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  LandingBackgroundSlideshow,
  nextAvailableSlideIndex,
} from "./LandingBackgroundSlideshow";

describe("대문 게임 이미지 슬라이드", () => {
  it("게임에서 사용하는 다섯 이미지를 시작 마을부터 제공한다", () => {
    const html = renderToStaticMarkup(<LandingBackgroundSlideshow />);

    expect(html).toContain("%2Fimages%2Fui%2Fvillage.webp");
    expect(html).toContain("%2Fimages%2Fui%2Fbattle.webp");
    expect(html).toContain("%2Fimages%2Fui%2Ffishing.webp");
    expect(html).toContain("%2Fimages%2Fui%2Fguild.webp");
    expect(html).toContain("%2Fimages%2Fui%2Fhunt.webp");
    expect(html).toContain('aria-label="시작 마을 이미지 보기"');
    expect(html).toContain('aria-current="true"');
    expect(html).toContain("게임에서 사용하는 지역 이미지");
    expect(html).not.toContain("실제 게임 화면");
  });

  it("모바일에서는 전체 장면을 보존하고 어두운 배경으로 빈 공간을 채운다", () => {
    const html = renderToStaticMarkup(<LandingBackgroundSlideshow />);

    expect(html).toMatch(
      /data-landing-image-layer="mobile-backdrop"[^>]*class="[^"]*object-cover[^"]*sm:hidden/,
    );
    expect(html).toMatch(
      /data-landing-image-layer="scene"[^>]*class="[^"]*object-contain[^"]*object-top[^"]*sm:object-cover/,
    );
  });

  it("실패한 이미지를 건너뛰고 끝에서 처음으로 순환한다", () => {
    expect(nextAvailableSlideIndex(0, new Set([1, 2]))).toBe(3);
    expect(nextAvailableSlideIndex(4, new Set())).toBe(0);
    expect(nextAvailableSlideIndex(2, new Set([0, 1, 2, 3, 4]))).toBe(2);
  });
});
