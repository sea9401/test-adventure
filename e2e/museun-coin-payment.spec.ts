import { expect, test } from "@playwright/test";

test("운영 기본값에서 결제 화면과 사용자 API는 실제 404로 닫혀 있다", async ({
  request,
}) => {
  for (const { path, method } of [
    { path: "/settings/coin-shop/payment/fail?code=PAY_PROCESS_CANCELED", method: "GET" },
    { path: "/api/v2/museun-coin-payments/orders", method: "GET" },
    { path: "/api/v2/museun-coin-payments/orders", method: "POST" },
    { path: "/api/v2/museun-coin-payments/confirm", method: "POST" },
    { path: "/api/v2/museun-coin-payments/refunds", method: "POST" },
  ] as const) {
    const response = await request.fetch(path, { method, maxRedirects: 0 });
    expect(response.status(), path).toBe(404);
  }
});

test("공개 페이지 CSP는 Toss 결제창 출처만 추가 허용한다", async ({ request }) => {
  const response = await request.get("/sign-in");
  const policy = response.headers()["content-security-policy"];
  expect(policy).toContain("connect-src 'self'");
  expect(policy).toContain("frame-src");
  expect(policy).toContain("https://*.tosspayments.com");
  expect(policy).not.toContain("TOSS_PAYMENTS_SECRET_KEY");
});
