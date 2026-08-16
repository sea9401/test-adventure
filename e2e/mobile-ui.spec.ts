import { expect, test } from "@playwright/test";

const WIDTH_SAFE_SURFACES = [
  { path: "/dev/shop", label: "상점" },
  { path: "/dev/marketplace", label: "거래소" },
  { path: "/dev/skill-loadout", label: "스킬 장착" },
  { path: "/dev/housing", label: "숙소" },
  { path: "/dev/job-codex", label: "직업 도감" },
  { path: "/dev/battle-log", label: "전투 로그" },
] as const;

for (const surface of WIDTH_SAFE_SURFACES) {
  test(`${surface.label}은 모바일에서 가로 넘침이 없다`, async ({ page }) => {
    const response = await page.goto(surface.path);

    expect(response?.status()).toBe(200);
    await expect(page.locator("body")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    const layout = await page.evaluate(() => {
      const visualWidth = window.visualViewport?.width ?? window.innerWidth;
      const oversized = Array.from(document.body.querySelectorAll("*"))
        .map((element) => {
          const node = element as HTMLElement;
          const rect = node.getBoundingClientRect();
          const style = window.getComputedStyle(node);
          return {
            tag: node.tagName.toLowerCase(),
            className: node.className.toString().slice(0, 180),
            text: node.innerText?.trim().replace(/\s+/g, " ").slice(0, 80) ?? "",
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            scrollWidth: node.scrollWidth,
            minWidth: style.minWidth,
            display: style.display,
          };
        })
        .filter((entry) => entry.width > visualWidth + 1 || entry.right > visualWidth + 1)
        .sort((a, b) => b.width - a.width)
        .slice(0, 12);
      return {
        visualWidth,
        documentWidth: document.documentElement.scrollWidth,
        oversized,
      };
    });

    expect(
      layout.documentWidth,
      JSON.stringify({ oversized: layout.oversized }, null, 2),
    ).toBeLessThanOrEqual(layout.visualWidth + 1);
  });
}

test("숙소 확대는 내부 캔버스만 스크롤한다", async ({ page }) => {
  await page.goto("/dev/housing");

  const zoomButton = page.getByRole("button", { name: "방 확대" });
  await expect(zoomButton).toBeVisible();
  await zoomButton.click();
  await expect(page.getByRole("button", { name: "전체 보기" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const measurements = await page
    .getByTestId("housing-room-scroll")
    .evaluate((scrollSurface) => {
      const canvas = scrollSurface.querySelector<HTMLElement>(
        '[data-testid="housing-room-canvas"]',
      );
      return {
        surfaceClientWidth: scrollSurface.clientWidth,
        surfaceScrollWidth: scrollSurface.scrollWidth,
        canvasWidth: canvas?.getBoundingClientRect().width ?? 0,
        documentWidth: document.documentElement.scrollWidth,
        visualWidth: window.visualViewport?.width ?? window.innerWidth,
      };
    });

  expect(measurements.surfaceScrollWidth).toBeGreaterThan(
    measurements.surfaceClientWidth,
  );
  expect(measurements.canvasWidth).toBeGreaterThan(
    measurements.surfaceClientWidth,
  );
  expect(measurements.documentWidth).toBeLessThanOrEqual(
    measurements.visualWidth + 1,
  );
});

test("직업 도감의 긴 섹션은 필요할 때 펼친다", async ({ page }) => {
  await page.goto("/dev/job-codex");

  const lockedSection = page.getByRole("button", { name: "조건 부족 펼치기" });
  await expect(lockedSection).toHaveAttribute("aria-expanded", "false");
  await lockedSection.click();
  await expect(
    page.getByRole("button", { name: "조건 부족 접기" }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("야영꾼", { exact: true })).toBeVisible();
});

test("전투 로그 보조 정보는 모바일에서도 읽을 수 있는 크기다", async ({
  page,
}) => {
  await page.goto("/dev/battle-log");

  const metadata = page.locator("[data-battle-log-metadata]");
  await expect(metadata).toHaveCount(3);
  const fontSizes = await metadata.evaluateAll((elements) =>
    elements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
  );

  expect(fontSizes.every((fontSize) => fontSize >= 12)).toBe(true);
});
