import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppLaunchSplash } from "./AppLaunchSplash";

describe("설치 앱 시작 화면", () => {
  it("검은 앱 스플래시용 래퍼에 게임 파비콘을 표시한다", () => {
    const html = renderToStaticMarkup(<AppLaunchSplash />);

    expect(html).toContain("app-launch-splash");
    expect(html).toContain('src="/icon-192.png"');
    expect(html).toContain('width="112"');
    expect(html).toContain('height="112"');
  });
});
