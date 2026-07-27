import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetOpsAlertsForTests,
  sanitizeOpsWebhookDetail,
  sendOpsAlert,
} from "./opsAlert";

const USER_ID = "123e4567-e89b-42d3-a456-426614174000";

describe("운영 웹훅 개인정보 최소화", () => {
  beforeEach(() => {
    resetOpsAlertsForTests();
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("OPS_ALERT_WEBHOOK_URL", "https://hooks.example/default");
    vi.stubEnv("OPS_ALERT_ABUSE_WEBHOOK_URL", "https://hooks.example/abuse");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 204 })),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("IP·사용자 식별자·닉네임·계정 목록을 외부 payload에서 제거한다", async () => {
    await sendOpsAlert("[ops] 동일 IP 30분 지속 접속: 비밀닉네임", {
      alertType: "abuse.persistent_same_ip",
      signalKey: `abuse:persistent-same-ip:203.0.113.8:${USER_ID}`,
      ip: "203.0.113.8",
      userId: USER_ID,
      name: "비밀닉네임",
      accounts: [{ userId: USER_ID, name: "비밀닉네임" }],
      adminEmail: "admin@example.com",
      queueIds: [17, 18],
      accountCount: 2,
      riskLevel: "high",
    });

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("https://hooks.example/abuse");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const payload = JSON.parse(String(init.body)) as {
      text: string;
      detail: Record<string, unknown>;
    };

    expect(payload.text).toBe("[ops] abuse: abuse.persistent_same_ip");
    expect(payload.detail).toEqual({
      alertType: "abuse.persistent_same_ip",
      accountCount: 2,
      riskLevel: "high",
      channel: "abuse",
    });
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("203.0.113.8");
    expect(serialized).not.toContain(USER_ID);
    expect(serialized).not.toContain("비밀닉네임");
    expect(serialized).not.toContain("admin@example.com");
  });

  it("일일 리포트의 코드·집계값만 허용한다", () => {
    expect(
      sanitizeOpsWebhookDetail({
        alertType: "ops.daily_report",
        abuseEvents: 12,
        topAbuseActions: [
          { key: "v2:fishing:cast", count: 7 },
          { key: "닉네임 포함 값", count: 1 },
        ],
        userId: USER_ID,
      }),
    ).toEqual({
      alertType: "ops.daily_report",
      abuseEvents: 12,
      topAbuseActions: [{ key: "v2:fishing:cast", count: 7 }],
    });
  });

  it("Discord 웹훅에는 content·embed 형식으로 안전한 값만 전송한다", async () => {
    vi.stubEnv(
      "OPS_ALERT_WEBHOOK_URL",
      "https://discord.com/api/webhooks/123/secret-token",
    );

    await sendOpsAlert("[ops] 사용자 이름이 들어간 내부 메시지", {
      channel: "default",
      alertType: "ops.daily_report",
      failed: 3,
      userId: USER_ID,
      adminEmail: "admin@example.com",
    });

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://discord.com/api/webhooks/123/secret-token",
    );
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const payload = JSON.parse(String(init.body)) as {
      content: string;
      embeds: Array<{ description: string; timestamp: string }>;
      allowed_mentions: { parse: string[] };
    };

    expect(payload.content).toBe("[ops] default: ops.daily_report");
    expect(payload.allowed_mentions).toEqual({ parse: [] });
    expect(payload.embeds[0].description).toContain('"failed": 3');
    expect(payload.embeds[0].timestamp).toBeTruthy();
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain(USER_ID);
    expect(serialized).not.toContain("admin@example.com");
    expect(serialized).not.toContain("사용자 이름");
  });
});
