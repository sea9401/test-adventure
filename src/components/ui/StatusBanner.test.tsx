import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatusBanner } from "./StatusBanner";

describe("StatusBanner", () => {
  it("처리 가능 상태를 오류와 다른 주황색 의미로 표시한다", () => {
    const html = renderToStaticMarkup(
      <StatusBanner tone="actionable" role="status">
        수확 가능
      </StatusBanner>,
    );

    expect(html).toContain("border-orange-300");
    expect(html).toContain("bg-orange-50");
    expect(html).toContain('role="status"');
  });

  it.each([
    ["success", "border-emerald-700", "text-emerald-300"],
    ["error", "border-rose-700", "text-rose-300"],
    ["warning", "border-amber-700", "text-amber-300"],
    ["info", "border-sky-700", "text-sky-300"],
    ["actionable", "border-orange-800", "text-orange-200"],
  ] as const)(
    "%s 상태는 의미색을 남기고 다크모드 배경을 중립화한다",
    (tone, borderClass, textClass) => {
      const html = renderToStaticMarkup(
        <StatusBanner tone={tone}>상태 안내</StatusBanner>,
      );

      expect(html).toContain("dark:bg-zinc-950");
      expect(html).toContain(`dark:${borderClass}`);
      expect(html).toContain(`dark:${textClass}`);
      expect(html).not.toMatch(
        /dark:bg-(emerald|rose|amber|sky|orange)-/,
      );
    },
  );
});
