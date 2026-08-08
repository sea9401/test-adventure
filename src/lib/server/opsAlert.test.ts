import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetOpsAlertsForTests,
  sanitizeOpsWebhookDetail,
  sendOpsAlert,
} from "./opsAlert";

const USER_ID = "123e4567-e89b-42d3-a456-426614174000";

describe("운영 웹훅 식별 정보", () => {
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

  it("인게임 닉네임·짧은 계정 ID는 남기고 IP·이메일·전체 ID는 제거한다", async () => {
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

    expect(payload.text).toBe(
      "⚠️ 같은 IP의 여러 계정이 30분 이상 접속 중입니다",
    );
    expect(payload.detail).toEqual({
      alertType: "abuse.persistent_same_ip",
      accountCount: 2,
      riskLevel: "high",
      actorAccount: "비밀닉네임 · 123e4567…",
      channel: "abuse",
    });
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("203.0.113.8");
    expect(serialized).not.toContain(USER_ID);
    expect(serialized).toContain("비밀닉네임");
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
      embeds: Array<{
        description: string;
        fields: Array<{ name: string; value: string }>;
        footer: { text: string };
        timestamp: string;
      }>;
      allowed_mentions: { parse: string[] };
    };

    expect(payload.content).toBe("📊 지난 24시간 운영 요약");
    expect(payload.allowed_mentions).toEqual({ parse: [] });
    expect(payload.embeds[0].description).toContain("최근 24시간");
    expect(payload.embeds[0].description).toContain("확인할 일");
    expect(payload.embeds[0].fields).toContainEqual({
      name: "실패 건수",
      value: "3",
      inline: true,
    });
    expect(payload.embeds[0].footer.text).toBe(
      "기본 운영 · 알림 코드: ops.daily_report",
    );
    expect(payload.embeds[0].timestamp).toBeTruthy();
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain(USER_ID);
    expect(serialized).not.toContain("admin@example.com");
    expect(serialized).not.toContain("사용자 이름");
  });

  it("Discord 알림의 내부 코드를 쉬운 한국어와 읽기 좋은 값으로 바꾼다", async () => {
    vi.stubEnv(
      "OPS_ALERT_ABUSE_WEBHOOK_URL",
      "https://discord.com/api/webhooks/123/secret-token",
    );

    await sendOpsAlert("[ops] internal label", {
      channel: "abuse",
      alertType: "abuse.extreme_daily_activity",
      activity: "woodcutting",
      dailyCompleted: 1520,
      riskLevel: "critical",
      windowMs: 24 * 60 * 60_000,
      userId: USER_ID,
    });

    const fetchMock = vi.mocked(fetch);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const payload = JSON.parse(String(init.body)) as {
      content: string;
      embeds: Array<{
        description: string;
        fields: Array<{ name: string; value: string }>;
      }>;
    };

    expect(payload.content).toBe(
      "🚨 하루 생활 활동량이 매우 높은 계정이 감지됐습니다",
    );
    expect(payload.embeds[0].description).toContain(
      "관리자 > 운영 현황 > 이상 행동",
    );
    expect(payload.embeds[0].fields).toEqual(
      expect.arrayContaining([
        { name: "생활 활동", value: "벌목", inline: true },
        { name: "오늘 해당 활동", value: "1,520", inline: true },
        { name: "위험 단계", value: "매우 높음", inline: true },
        { name: "집계 시간", value: "1일", inline: true },
      ]),
    );
    expect(JSON.stringify(payload)).not.toContain(USER_ID);
  });

  it("Discord 경제 알림에 발생 계정·상대 계정·거래 내용을 같이 보여준다", async () => {
    vi.stubEnv(
      "OPS_ALERT_ECONOMY_WEBHOOK_URL",
      "https://discord.com/api/webhooks/123/secret-token",
    );

    await sendOpsAlert("[ops] internal label", {
      channel: "economy",
      alertType: "economy.large_gold_movement",
      eventType: "marketplace.buy",
      goldDelta: -25_000_000,
      userId: "actor-user-123456",
      counterpartyUserId: "seller-user-987654",
    });

    const fetchMock = vi.mocked(fetch);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const payload = JSON.parse(String(init.body)) as {
      embeds: Array<{ fields: Array<{ name: string; value: string; inline: boolean }> }>;
    };
    expect(payload.embeds[0].fields).toEqual(
      expect.arrayContaining([
        { name: "발생 계정", value: "actor-us…", inline: false },
        { name: "상대 계정", value: "seller-u…", inline: false },
        { name: "관련 이벤트", value: "`marketplace.buy`", inline: false },
        { name: "골드 변동", value: "-25,000,000 G", inline: true },
      ]),
    );
  });

  it("극단적 저가 체결 알림에 판매자·구매자와 판정 근거를 보여준다", async () => {
    vi.stubEnv(
      "OPS_ALERT_ECONOMY_WEBHOOK_URL",
      "https://discord.com/api/webhooks/123/secret-token",
    );

    await sendOpsAlert("[ops] internal label", {
      channel: "economy",
      alertType: "economy.marketplace_extreme_low_price",
      eventType: "marketplace.buy",
      itemKind: "equip",
      itemId: "v2_endgame_sword",
      quantity: 1,
      actualTradeGold: 1,
      actualUnitPrice: 1,
      referenceUnitPrice: 600_000,
      priceRatioPct: 0,
      referenceSampleCount: 0,
      referenceType: "catalog_floor",
      buyerUserId: "buyer-user-123456",
      sellerUserId: "seller-user-987654",
    });

    const fetchMock = vi.mocked(fetch);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const payload = JSON.parse(String(init.body)) as {
      content: string;
      embeds: Array<{ fields: Array<{ name: string; value: string; inline: boolean }> }>;
    };
    expect(payload.content).toContain("비정상적으로 싼 거래");
    expect(payload.embeds[0].fields).toEqual(
      expect.arrayContaining([
        { name: "구매 계정", value: "buyer-us…", inline: false },
        { name: "판매 계정", value: "seller-u…", inline: false },
        { name: "아이템 ID", value: "v2_endgame_sword", inline: true },
        { name: "실제 체결 총액", value: "1 G", inline: true },
        {
          name: "판정 기준 개당 가격",
          value: "600,000 G",
          inline: true,
        },
        { name: "판정 기준", value: "장비 NPC 판매가", inline: true },
      ]),
    );
  });
});
