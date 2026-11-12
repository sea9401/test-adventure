import { expect, test } from "@playwright/test";

test("결제 결과 화면은 비로그인 요청을 로그인 화면으로 보낸다", async ({ request }) => {
  const response = await request.fetch(
    "/settings/coin-shop/payment/fail?code=PAY_PROCESS_CANCELED",
    { maxRedirects: 0 },
  );
  expect(response.status()).toBe(307);
  expect(response.headers().location).toContain("/sign-in");
});

// 추적되는 .env.production 의 결제 모드는 disabled 다. 운영 런타임(SSM)이 live 로 덮어쓰기 전에는
// 상점이 열려 있어도 주문·승인·환불 API가 404로 닫혀 있어야 한다.
test("추적 설정의 결제 모드에서는 결제 API가 실제 404로 닫혀 있다", async ({
  request,
}) => {
  for (const { path, method } of [
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
