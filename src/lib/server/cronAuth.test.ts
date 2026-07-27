import { afterEach, describe, expect, it, vi } from "vitest";
import { requireCronAuth } from "./cronAuth";

function request(authorization?: string): Request {
  return new Request("https://msmsge.com/api/cron/test", {
    headers: authorization ? { authorization } : undefined,
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("requireCronAuth", () => {
  it("CRON_SECRET이 없으면 모든 요청을 거부한다", () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(requireCronAuth(request("Bearer anything"))?.status).toBe(401);
  });

  it("정확히 일치하는 Bearer 토큰만 허용한다", () => {
    vi.stubEnv("CRON_SECRET", "cron-secret-at-least-32-characters");
    expect(requireCronAuth(request())?.status).toBe(401);
    expect(requireCronAuth(request("Bearer wrong"))?.status).toBe(401);
    expect(
      requireCronAuth(request("Bearer cron-secret-at-least-32-characters")),
    ).toBeNull();
  });
});
