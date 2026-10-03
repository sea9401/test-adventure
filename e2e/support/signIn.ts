import { expect, type Page } from "@playwright/test";
import { AGE_ELIGIBILITY_COOKIE } from "../../src/lib/ageEligibility";

const LOCAL_ORIGIN = "http://localhost:3212";

// 2026-10-04 00:00(한국시간)부터 로그인 대문은 만 14세 이상 확인을 먼저 받는다.
// 확인 화면이 보이면 확인을 저장하고, 비밀번호 로그인 펼침이 나타날 때까지 기다린다.
export async function openPasswordLogin(page: Page) {
  await page.goto("/sign-in");
  const passwordLoginSummary = page
    .locator("summary")
    .filter({ hasText: "아이디·비밀번호로 로그인" });
  const ageCheckbox = page.getByRole("checkbox", {
    name: "본인은 만 14세 이상입니다.",
  });
  await expect(passwordLoginSummary.or(ageCheckbox)).toBeVisible();
  if (await ageCheckbox.isVisible()) {
    await confirmAgeEligibility(page);
  }
  await expect(passwordLoginSummary).toBeVisible();
  await passwordLoginSummary.click();
}

async function confirmAgeEligibility(page: Page) {
  // 운영 응답은 확인 쿠키를 Secure로 보낸다. Chromium은 localhost를 신뢰하지만 WebKit은
  // HTTP E2E 서버에서 Secure 쿠키를 거부한다. 같은 확인 API를 직접 호출해 서버가 발급한
  // 값을 이 테스트 컨텍스트에만 복사한다(기기 세션 쿠키와 같은 처리, localHttpBrowser.ts 참고).
  const response = await page.request.post("/api/age-eligibility", {
    headers: { origin: LOCAL_ORIGIN },
    data: { confirmed: true },
  });
  expect(response.ok()).toBe(true);
  const setCookie = response
    .headersArray()
    .filter((header) => header.name.toLowerCase() === "set-cookie")
    .map((header) => header.value)
    .join("\n");
  const token = setCookie.match(
    new RegExp(`${AGE_ELIGIBILITY_COOKIE}=([^;]+)`),
  )?.[1];
  if (!token) throw new Error("The local E2E age confirmation issued no cookie");
  await page.context().addCookies([
    {
      name: AGE_ELIGIBILITY_COOKIE,
      value: token,
      url: LOCAL_ORIGIN,
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
  await page.goto("/sign-in");
}
