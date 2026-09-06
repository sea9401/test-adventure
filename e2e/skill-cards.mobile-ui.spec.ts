import { expect, test } from "@playwright/test";

for (const width of [320, 390, 1280]) {
  for (const theme of ["light", "dark"]) {
    test(`스킬 카드 ${width}px ${theme}: 요약·상세와 독립적인 동작`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.route("**/api/auth/session", (route) => route.fulfill({ json: null }));
      await page.goto("/dev/skill-loadout");
      await page.evaluate((value) => document.documentElement.classList.toggle("dark", value === "dark"), theme);
      await page.getByPlaceholder("스킬 검색").fill("파공");
      const card = page.locator('li[data-skill-drop-id="v2c_skyascendant_voidbreak"]');
      await expect(card).toBeVisible();
      await expect(card.getByText("MP 119", { exact: true })).toBeVisible();
      const coefficient = card.getByText("1~3타 · 피해 공격력×0.3 + 민첩×0.43", { exact: true });
      await expect(coefficient).toBeHidden();
      await expect(page.locator("button details")).toHaveCount(0);
      await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
      await card.screenshot({ path: testInfo.outputPath(`skill-${width}-${theme}-collapsed.png`) });
      await card.locator("summary").focus();
      await page.keyboard.press("Enter");
      await expect(coefficient).toBeVisible();
      await expect(card.getByText("PvP 교차·추격", { exact: true })).toBeVisible();
      await card.screenshot({ path: testInfo.outputPath(`skill-${width}-${theme}-expanded.png`) });
      await page.keyboard.press("Enter");
      await expect(coefficient).toBeHidden();
      await card.getByRole("button", { name: "파공 상세 보기", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "파공", exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await card.getByRole("button", { name: "파공 즐겨찾기 해제", exact: true }).click();
      await expect(card.getByRole("button", { name: "파공 즐겨찾기", exact: true })).toBeVisible();
      await card.getByRole("button", { name: "파공 해제", exact: true }).click();
      await card.getByRole("button", { name: "파공 장착", exact: true }).click();
      await expect(card.getByText("장착 중", { exact: true })).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      for (const button of await card.locator("[data-skill-card-actions] button").all()) {
        const box = await button.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(box!.width).toBeLessThan(100);
      }
      const background = await card.evaluate((element) => getComputedStyle(element).backgroundColor);
      expect(background).not.toBe("rgba(0, 0, 0, 0)");
      expect(background).not.toMatch(/rgba\([^)]*,\s*0\./);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
}
