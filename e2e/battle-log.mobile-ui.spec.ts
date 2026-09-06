import { expect, test } from "@playwright/test";

test.describe("전투 로그 시안 적용", () => {
  for (const width of [320, 390, 1280]) {
    for (const theme of ["light", "dark"]) {
      test(`${width}px ${theme}: 양쪽 정렬과 접힌 타격 기록`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        // The public fixture does not require an auth/database connection.
        await page.route("**/api/auth/session", (route) => route.fulfill({ json: null }));
        await page.goto("/dev/battle-log");
        await page.evaluate((value) => document.documentElement.classList.toggle("dark", value === "dark"), theme);
        const actions = page.locator("[data-battle-action]");
        await expect(actions).toHaveCount(6);
        await expect(page.getByText("22,746 피해", { exact: true })).toBeVisible();
        await expect(page.getByText("1타 3,472 피해", { exact: true })).not.toBeVisible();
        await expect(page.getByText("내 공격력 +20% · 3행동", { exact: true })).toBeVisible();
        for (const side of ["left", "right"]) {
          const card = page.locator(`[data-battle-action="${side}"]`).first();
          await expect(card.locator("section")).toHaveCSS("text-align", side);
          await expect(card.locator("[data-battle-identity]")).toHaveCSS("justify-content", side === "left" ? "flex-start" : "flex-end");
          await expect(card.locator("[data-battle-effects]")).toHaveCSS("justify-content", side === "left" ? "flex-start" : "flex-end");
          const surface = await card.locator("section").evaluate((element) => getComputedStyle(element).backgroundColor);
          expect(surface).not.toMatch(/rgba\([^)]*,\s*0\./);
          expect(surface).not.toBe("rgba(0, 0, 0, 0)");
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
        await page.screenshot({ path: testInfo.outputPath(`battle-log-${width}-${theme}.png`), fullPage: true });
        const disclosure = page.locator("summary").filter({ hasText: "타격별 기록 보기" });
        await disclosure.focus();
        await page.keyboard.press("Enter");
        await expect(page.getByText("4타 5,831 피해", { exact: true })).toBeVisible();
        await expect(page.getByText("6,499 추가 피해", { exact: true })).toBeVisible();
        await page.keyboard.press("Enter");
        await expect(page.getByText("4타 5,831 피해", { exact: true })).not.toBeVisible();
        await page.getByRole("button", { name: "compact", exact: true }).click();
        await expect(actions).toHaveCount(6);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      });
    }
  }
});
