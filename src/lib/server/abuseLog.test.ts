import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
  },
}));
vi.mock("@/lib/server/opsAlert", () => ({ recordOpsSignal: vi.fn() }));

import { clientIpFromRequest } from "./abuseLog";

describe("clientIpFromRequest", () => {
  it("Nginx가 덮어쓴 X-Real-IP를 spoof 가능한 전달 체인보다 우선한다", () => {
    const req = new Request("https://example.test", {
      headers: {
        "x-real-ip": "203.0.113.10",
        "x-forwarded-for": "198.51.100.77, 10.0.0.1",
      },
    });
    expect(clientIpFromRequest(req)).toBe("203.0.113.10");
  });

  it("X-Real-IP가 없으면 전달 체인의 오른쪽 끝 주소만 사용한다", () => {
    const req = new Request("https://example.test", {
      headers: { "x-forwarded-for": "198.51.100.77, 203.0.113.20" },
    });
    expect(clientIpFromRequest(req)).toBe("203.0.113.20");
  });

  it("IP 형식이 아닌 임의 헤더 값은 rate-limit key로 받아들이지 않는다", () => {
    const req = new Request("https://example.test", {
      headers: {
        "x-real-ip": "attacker-controlled-key",
        "x-forwarded-for": "also-not-an-ip",
      },
    });
    expect(clientIpFromRequest(req)).toBeNull();
  });
});
