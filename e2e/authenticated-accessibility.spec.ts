import { expect, test, type Page } from "@playwright/test";
import {
  a11yViolationSummary,
  expectNoA11yViolations,
  expectNoDocumentOverflow,
} from "./support/accessibility";
import {
  authenticatedE2eConfig,
  resetAuthenticatedE2eAccount,
  seedAuthenticatedE2ePhaseThreeState,
} from "./support/authenticatedDatabase";
import { prepareLocalHttpBrowser } from "./support/localHttpBrowser";

const LOCAL_ORIGIN = "http://localhost:3212";
const CHARACTER_NAME = "접근성검증모험가";
const PHASE_TWO_CHARACTER_NAME = "2차접근모험가";
const account = authenticatedE2eConfig();

const CRITICAL_SURFACES = [
  { path: "/", heading: "모험" },
  { path: "/battle/dungeon", heading: "사냥터" },
  { path: "/plaza/market", heading: "거래소" },
  { path: "/plaza/inbox", heading: "알림" },
] as const;

const PHASE_TWO_SURFACES = [
  { path: "/character/inventory", heading: "인벤토리" },
  { path: "/character/skills", heading: "스킬" },
  { path: "/town", heading: "마을" },
  { path: "/town/farm", heading: "모험가 농장" },
  { path: "/town/life-workshop", heading: "생활 조합 작업장" },
  { path: "/guild", heading: "길드" },
  { path: "/settings/preferences", heading: "환경 설정" },
] as const;

test.skip(
  account === null,
  "격리 PostgreSQL과 E2E_TEST_LOGIN_ID/E2E_TEST_PASSWORD가 필요합니다.",
);

test.beforeEach(async ({ page }) => {
  await prepareLocalHttpBrowser(page, { authenticated: true });
  await resetAuthenticatedE2eAccount();
});

test("캐릭터 생성과 핵심 게임 화면에 자동 탐지 접근성 위반이 없다", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await createAuthenticatedCharacter(page, CHARACTER_NAME, {
    auditCreationPage: true,
  });

  const surfaceViolations = [];
  for (const surface of CRITICAL_SURFACES) {
    await page.goto(surface.path);
    await expect(page.locator("main")).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: surface.heading }),
    ).toHaveCount(1);
    await page.waitForLoadState("networkidle");
    const violations = await a11yViolationSummary(page);
    if (violations.length > 0) {
      surfaceViolations.push({ path: surface.path, violations });
    }
  }
  expect(surfaceViolations).toEqual([]);

  await page.goto("/");
  await expect(page.locator("main")).toBeVisible();
  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "본문으로 바로가기" });
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("#game-main-content")).toBeFocused();
  await expect(page.locator("#game-main-content main")).toHaveCount(1);
});

test("2차 게임 화면에 자동 탐지 접근성 위반이 없다", async ({ page }) => {
  test.setTimeout(120_000);
  await createAuthenticatedCharacter(page, PHASE_TWO_CHARACTER_NAME);

  const surfaceViolations = [];
  for (const surface of PHASE_TWO_SURFACES) {
    await page.goto(surface.path);
    await expect(page.locator("main")).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: surface.heading }),
    ).toHaveCount(1);
    await page.waitForLoadState("networkidle");
    const violations = await a11yViolationSummary(page);
    if (violations.length > 0) {
      surfaceViolations.push({ path: surface.path, violations });
    }
  }
  expect(surfaceViolations).toEqual([]);
});

test("채팅을 키보드로 열고 닫으면 실행 버튼으로 포커스가 돌아온다", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await createAuthenticatedCharacter(page, "채팅접근모험가");

  const toggle = page.getByTestId("floating-chat-toggle");
  await toggle.focus();
  await expect(toggle).toBeFocused();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog", { name: "채팅" });
  await expect(dialog).toBeVisible();
  const closeButton = dialog.getByRole("button", { name: "채팅 닫기" });
  await expect(closeButton).toBeFocused();
  await expectNoA11yViolations(page);

  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("floating-chat-toggle")).toBeFocused();
});

test("데이터가 채워진 성장·생활·거래 화면에 자동 탐지 접근성 위반이 없다", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await createAuthenticatedCharacter(page, "3차상태모험가");
  await seedAuthenticatedE2ePhaseThreeState();

  const stateViolations = [];

  await page.goto("/character/inventory");
  await page.getByRole("tab", { name: "재료", exact: true }).click();
  await expect(page.getByText("소나무 원목", { exact: true }).first()).toBeVisible();
  let violations = await a11yViolationSummary(page);
  if (violations.length > 0) {
    stateViolations.push({ state: "inventory-materials", violations });
  }

  await page.goto("/town/life-workshop");
  await page.getByRole("button", { name: "재료 가공", exact: true }).click();
  const processingRecipeSelect = page
    .getByRole("combobox", { name: /재료 선택/ })
    .first();
  await expect(processingRecipeSelect).toBeVisible();
  await expect(processingRecipeSelect.locator("option:checked")).toContainText(
    "소나무 원목",
  );
  violations = await a11yViolationSummary(page);
  if (violations.length > 0) {
    stateViolations.push({ state: "life-processing", violations });
  }

  await page.goto("/plaza/market");
  await page
    .getByRole("button", { name: /^판매(?: 아이템 올리기)?$/ })
    .click();
  await page.getByRole("tab", { name: "재료", exact: true }).click();
  await expect(
    page.getByRole("spinbutton", { name: "소나무 원목 판매 수량" }),
  ).toBeVisible();
  violations = await a11yViolationSummary(page);
  if (violations.length > 0) {
    stateViolations.push({ state: "marketplace-selling", violations });
  }

  expect(stateViolations).toEqual([]);
});

test("창단한 길드의 정보·길드원·토벌전·시설·관리 화면에 자동 탐지 접근성 위반이 없다", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await createAuthenticatedCharacter(page, "3차길드모험가");
  await seedAuthenticatedE2ePhaseThreeState();

  await page.goto("/guild");
  await page.getByPlaceholder("예: 새벽의 기사단").fill("접근성길드");
  await page.getByRole("button", { name: /길드 창단/ }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "접근성길드" }),
  ).toBeVisible();

  const guildTabs = [
    { key: "info", label: "길드 정보" },
    { key: "members", label: "길드원" },
    { key: "raid", label: "토벌전" },
    { key: "facilities", label: "시설" },
    { key: "manage", label: "관리" },
  ] as const;
  const guildViolations = [];

  for (const guildTab of guildTabs) {
    await page.goto(`/guild?tab=${guildTab.key}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "접근성길드" }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: guildTab.label, exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await page.waitForLoadState("networkidle");
    const violations = await a11yViolationSummary(page);
    if (violations.length > 0) {
      guildViolations.push({ tab: guildTab.key, violations });
    }
  }

  expect(guildViolations).toEqual([]);
});

test("보기 전용 관리자 대표 화면에 자동 탐지 접근성 위반이 없다", async ({
  page,
}) => {
  test.setTimeout(180_000);
  if (!account) throw new Error("Authenticated E2E configuration is missing");
  await loginWithPassword(page, account.loginId, account.password);
  await expect(page).toHaveURL(`${LOCAL_ORIGIN}/`);

  const adminTabs = [
    { key: "opsDashboard", label: "운영 홈" },
    { key: "users", label: "유저 관리" },
    { key: "broadcast", label: "공지·우편" },
    { key: "safetyReports", label: "신고 관리" },
    { key: "stats", label: "전체 통계" },
    { key: "audit", label: "관리자 기록" },
  ] as const;
  const adminViolations = [];

  for (const adminTab of adminTabs) {
    await page.goto(`/admin?tab=${adminTab.key}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "관리자 도구" }),
    ).toBeVisible();
    await expect(page.locator("main")).toHaveCount(1);
    await expect(
      page.getByRole("heading", { level: 2, name: adminTab.label }),
    ).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "보기 전용" })).toBeChecked();
    await page.waitForLoadState("networkidle");
    const violations = await a11yViolationSummary(page);
    if (violations.length > 0) {
      adminViolations.push({ tab: adminTab.key, violations });
    }
  }

  expect(adminViolations).toEqual([]);
});

test("4차 동적 작업 결과와 입력 오류를 보조기기에 알린다", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await createAuthenticatedCharacter(page, "4차상태모험가");
  await seedAuthenticatedE2ePhaseThreeState();

  await page.goto("/town/life-workshop");
  await page.getByRole("button", { name: "재료 가공", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: /재료 선택/ }).first(),
  ).toBeVisible();

  const maxProcessingButton = page
    .getByRole("button", { name: /^최대 [\d,]+회$/ })
    .first();
  await maxProcessingButton.focus();
  await maxProcessingButton.click();
  const maxDialog = page.getByRole("dialog", {
    name: /^최대 [\d,]+회를 가공할까요\?$/,
  });
  await expect(maxDialog).toBeVisible();
  await expect(maxDialog.getByRole("button", { name: "취소" })).toBeFocused();
  await maxDialog.getByRole("button", { name: "취소" }).click();
  await expect(maxDialog).toBeHidden();
  await expect(maxProcessingButton).toBeFocused();

  const processResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v2/life-workshop") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "1회 가공", exact: true })
    .first()
    .click();
  expect((await processResponse).status()).toBe(200);
  await expect(
    page.locator("main").getByRole("status").filter({ hasText: /개 완성/ }),
  ).toBeVisible();

  await openMaterialSelling(page);
  const priceInput = page.getByRole("textbox", {
    name: "소나무 원목 묶음 전체 시작 입찰가",
  });
  await expect(priceInput).toBeVisible();
  await priceInput.fill("");
  await page
    .getByRole("button", { name: "등록", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("alert").filter({
      hasText: "묶음 전체 시작 입찰가는 1 이상 정수로 입력하세요.",
    }),
  ).toBeVisible();
});

test("4차 320px 다크 모드에서 거래와 길드 기부 화면이 재배치된다", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ colorScheme: "dark" });
  await createAuthenticatedCharacter(page, "4차리플로우모험가");
  await seedAuthenticatedE2ePhaseThreeState();

  await openMaterialSelling(page);
  await expect(
    page.getByRole("textbox", {
      name: "소나무 원목 묶음 전체 시작 입찰가",
    }),
  ).toBeVisible();
  await expectNoA11yViolations(page);
  await expectNoDocumentOverflow(page);

  await page.goto("/guild");
  await page.getByPlaceholder("예: 새벽의 기사단").fill("4차접근성길드");
  await page.getByRole("button", { name: /길드 창단/ }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "4차접근성길드" }),
  ).toBeVisible();
  await page.goto("/guild?tab=facilities");
  await expect(
    page.getByRole("tab", { name: "시설", exact: true }),
  ).toHaveAttribute("aria-selected", "true");

  const donationButton = page
    .getByRole("button", { name: "재료 기부", exact: true })
    .first();
  await donationButton.focus();
  await donationButton.click();
  await expect(page.getByRole("slider", { name: /기부 수량$/ }).first()).toBeVisible();
  await expectNoA11yViolations(page);
  await expectNoDocumentOverflow(page);

  await page.getByRole("button", { name: "닫기", exact: true }).first().click();
  await expect(donationButton).toBeFocused();
});

test("4차 200% CSS 확대에서 거래소 판매 조작이 유지된다", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await createAuthenticatedCharacter(page, "4차확대모험가");
  await seedAuthenticatedE2ePhaseThreeState();
  await openMaterialSelling(page);
  await page.evaluate(() => {
    document.documentElement.style.setProperty("zoom", "2");
  });

  await expect(
    page.getByRole("spinbutton", { name: "소나무 원목 판매 수량" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", {
      name: "소나무 원목 묶음 전체 시작 입찰가",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "등록", exact: true }).first(),
  ).toBeVisible();
  await expectNoA11yViolations(page);
  await expectNoDocumentOverflow(page);
});

async function createAuthenticatedCharacter(
  page: Page,
  name: string,
  { auditCreationPage = false }: { auditCreationPage?: boolean } = {},
) {
  if (!account) throw new Error("Authenticated E2E configuration is missing");

  await loginWithPassword(page, account.loginId, account.password);
  await page
    .getByRole("link", { name: "캐릭터 만들고 시작하기" })
    .click();
  await expect(
    page.getByRole("heading", { name: "캐릭터 생성", level: 1 }),
  ).toBeVisible();
  if (auditCreationPage) await expectNoA11yViolations(page);

  await page.getByPlaceholder("이름 입력").fill(name);
  await expect(page.getByText("사용 가능한 이름이에요.")).toBeVisible();
  await page.getByRole("button", { name: "남성 1" }).click();
  await page
    .getByRole("checkbox", { name: /커뮤니티 운영정책/ })
    .check();

  const setupResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/profile/setup") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "모험 시작" }).click();
  expect((await setupResponse).status()).toBe(200);
  await expect(page).toHaveURL(`${LOCAL_ORIGIN}/`);
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
}

async function openMaterialSelling(page: Page) {
  await page.goto("/plaza/market");
  await page
    .getByRole("button", { name: /^판매(?: 아이템 올리기)?$/ })
    .click();
  await page.getByRole("tab", { name: "재료", exact: true }).click();
  await expect(
    page.getByRole("spinbutton", { name: "소나무 원목 판매 수량" }),
  ).toBeVisible();
}

async function loginWithPassword(page: Page, loginId: string, password: string) {
  await page.goto("/sign-in");
  const passwordLoginSummary = page
    .locator("summary")
    .filter({ hasText: "아이디·비밀번호로 로그인" });
  await expect(passwordLoginSummary).toBeVisible();
  await passwordLoginSummary.click();
  await page.getByLabel("아이디", { exact: true }).fill(loginId);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
}
