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

test("스킬 상세는 장착 액션과 분리해 열고 닫는다", async ({ page }) => {
  await page.goto("/dev/skill-loadout");

  const detailTrigger = page.getByRole("button", { name: "강타 상세 보기" });
  await detailTrigger.click();
  await expect(page.getByRole("dialog", { name: "강타" })).toBeVisible();
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "강타" })).toBeHidden();
  await expect(detailTrigger).toBeFocused();

  await page.getByRole("button", { name: "강타 해제" }).click();
  await page.getByRole("button", { name: "독침 장착" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("로드맵은 스킬 상세를 먼저 닫은 뒤 부모를 닫는다", async ({ page }) => {
  await page.goto("/dev/job-ladder");
  await page.getByRole("button", { name: "전직 로드맵" }).last().click();

  const roadmap = page.getByRole("dialog", { name: /전직 로드맵/ });
  await expect(roadmap).toBeVisible();
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");

  const roadmapElement = page.locator(
    '[aria-labelledby="job-roadmap-dialog-title"]',
  );
  const invalidTrigger = page.getByRole("button", {
    name: "손상된 스킬 상세 보기",
  });
  await invalidTrigger.click();
  await expect(page.getByRole("dialog", { name: "손상된 스킬" })).toHaveCount(0);
  await expect(roadmapElement).not.toHaveAttribute("aria-hidden", "true");
  await expect(roadmapElement).not.toHaveAttribute("inert", "");
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");

  const trigger = page.getByRole("button", { name: "강타 상세 보기" });
  await trigger.click();
  await expect(page.getByRole("dialog", { name: "강타" })).toBeVisible();
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");

  await expect(roadmapElement).toHaveAttribute("aria-hidden", "true");
  await expect(roadmapElement).toHaveAttribute("inert", "");

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "강타" })).toBeHidden();
  await expect(roadmap).toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");

  await page.keyboard.press("Escape");
  await expect(roadmap).toBeHidden();
});

test("스킬 상세의 반복 항목은 고유한 React key를 사용한다", async ({ page }) => {
  const duplicateKeyWarnings: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("same key")) {
      duplicateKeyWarnings.push(message.text());
    }
  });

  await page.goto("/dev/job-ladder");
  await page.getByRole("button", { name: "전직 로드맵" }).last().click();
  await page.getByRole("button", { name: "천궁궤적 상세 보기" }).click();
  await expect(page.getByRole("dialog", { name: "천궁궤적" })).toBeVisible();

  expect(duplicateKeyWarnings).toEqual([]);
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

test("긴 전투 행동명과 결과는 모바일 카드 안에서 모두 줄바꿈된다", async ({
  page,
}) => {
  await page.goto("/dev/battle-log");

  const action = page.locator('[data-battle-action="left"]').first();
  await expect(action).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  const layout = await action.evaluate((root) => {
    const section = root.querySelector<HTMLElement>("section");
    const grid = section?.firstElementChild as HTMLElement | null;
    const identity = grid?.children[0] as HTMLElement | undefined;
    const result = grid?.children[1] as HTMLElement | undefined;
    const title = identity?.lastElementChild as HTMLElement | null;
    const resultLine = result?.lastElementChild as HTMLElement | null;
    if (!section || !grid || !title || !resultLine) {
      throw new Error("전투 행동 카드 구조를 찾지 못했습니다.");
    }

    title.textContent = "개벽·오원소 회귀";
    resultLine.textContent = "플루디아 마나 451 회복했다.";

    const rootWidth = root.getBoundingClientRect().width;
    const sectionWidth = section.getBoundingClientRect().width;
    return {
      widthRatio: sectionWidth / rootWidth,
      titleWhiteSpace: getComputedStyle(title).whiteSpace,
      titleOverflows: title.scrollWidth > title.clientWidth + 1,
      gridOverflows: grid.scrollWidth > section.clientWidth + 1,
    };
  });

  expect(layout.widthRatio).toBeGreaterThan(0.95);
  expect(layout.titleWhiteSpace).not.toBe("nowrap");
  expect(layout.titleOverflows).toBe(false);
  expect(layout.gridOverflows).toBe(false);
});

test("한국어 본문은 어절 중간에서 줄바꿈하지 않는다", async ({ page }) => {
  await page.goto("/dev/battle-log");

  const copy = page.getByText(
    "공세 전술을 취한다. 공격이 거세지지만 방어와 회피가 무뎌진다.",
    { exact: true },
  );
  await expect(copy).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  const splitsInsideKoreanWords = await copy.evaluate((element) => {
    const textNode = Array.from(element.childNodes).find(
      (node) => node.nodeType === Node.TEXT_NODE,
    );
    if (!textNode?.textContent) return [];

    const characters = Array.from(textNode.textContent);
    const tops = characters.map((_, index) => {
      const range = document.createRange();
      range.setStart(textNode, index);
      range.setEnd(textNode, index + 1);
      return Math.round(range.getBoundingClientRect().top);
    });

    return characters.flatMap((character, index) => {
      const nextCharacter = characters[index + 1];
      if (
        nextCharacter &&
        /[가-힣]/.test(character) &&
        /[가-힣]/.test(nextCharacter) &&
        Math.abs(tops[index] - tops[index + 1]) > 2
      ) {
        return [`${character}|${nextCharacter}`];
      }
      return [];
    });
  });

  expect(splitsInsideKoreanWords).toEqual([]);
});
