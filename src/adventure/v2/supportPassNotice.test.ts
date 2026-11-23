import { describe, expect, it } from "vitest";
import {
  dueSupportPassNotices,
  markSupportPassNotices,
  parseSupportPassNoticeState,
  supportPassNotificationText,
} from "./supportPassNotice";

const DAY = 24 * 60 * 60 * 1_000;
const NOW = Date.UTC(2026, 10, 23, 3); // 2026-11-23 12:00 KST

function standard(endInDays: number) {
  return { activatedAt: NOW - 30 * DAY, activeUntil: NOW + endInDays * DAY };
}

describe("월간 모험 지원권 만료 알림", () => {
  it("지원권이 없거나 넉넉히 남았으면 알리지 않는다", () => {
    expect(dueSupportPassNotices(null, {}, NOW)).toEqual([]);
    expect(dueSupportPassNotices(standard(5), {}, NOW)).toEqual([]);
  });

  it("끝나기 3일 전부터 한 번 알린다", () => {
    const support = standard(2);
    const due = dueSupportPassNotices(support, {}, NOW);
    expect(due).toEqual([
      {
        type: "support_pass_expiring",
        payload: { tier: "standard", endAt: support.activeUntil, continuesStandard: false },
      },
    ]);
    const marked = markSupportPassNotices(parseSupportPassNoticeState({}), due);
    expect(dueSupportPassNotices(support, marked, NOW)).toEqual([]);
  });

  it("기간을 이어 붙여 끝나는 날이 바뀌면 그 날짜에 맞춰 다시 알린다", () => {
    const first = standard(2);
    const marked = markSupportPassNotices(
      parseSupportPassNoticeState({}),
      dueSupportPassNotices(first, {}, NOW),
    );
    const renewed = { ...first, activeUntil: first.activeUntil + 30 * DAY };
    expect(dueSupportPassNotices(renewed, marked, NOW)).toEqual([]);
    expect(
      dueSupportPassNotices(renewed, marked, renewed.activeUntil - DAY),
    ).toMatchObject([{ type: "support_pass_expiring", payload: { endAt: renewed.activeUntil } }]);
  });

  it("끝난 뒤 7일 안에 접속하면 끝났다고 한 번 알린다", () => {
    const support = standard(-1);
    const due = dueSupportPassNotices(support, {}, NOW);
    expect(due).toEqual([
      {
        type: "support_pass_expired",
        payload: { tier: "standard", endAt: support.activeUntil, continuesStandard: false },
      },
    ]);
    const marked = markSupportPassNotices(parseSupportPassNoticeState({}), due);
    expect(dueSupportPassNotices(support, marked, NOW)).toEqual([]);
    expect(dueSupportPassNotices(standard(-10), {}, NOW)).toEqual([]);
  });

  it("프리미엄이 끝나고 일반 지원권으로 이어지는 경우를 구분한다", () => {
    const support = {
      activatedAt: NOW - 30 * DAY,
      premiumUntil: NOW + 2 * DAY,
      activeUntil: NOW + 20 * DAY,
    };
    expect(dueSupportPassNotices(support, {}, NOW)).toEqual([
      {
        type: "support_pass_expiring",
        payload: { tier: "premium", endAt: support.premiumUntil, continuesStandard: true },
      },
    ]);
    // 프리미엄만 끝나고 일반이 남은 시점
    expect(dueSupportPassNotices(support, {}, support.premiumUntil + DAY)).toEqual([
      {
        type: "support_pass_expired",
        payload: { tier: "premium", endAt: support.premiumUntil, continuesStandard: true },
      },
    ]);
  });

  it("프리미엄과 전체 기간이 같이 끝나면 프리미엄 종료로 한 번만 알린다", () => {
    const support = {
      activatedAt: NOW - 30 * DAY,
      premiumUntil: NOW - DAY,
      activeUntil: NOW - DAY,
    };
    expect(dueSupportPassNotices(support, {}, NOW)).toEqual([
      {
        type: "support_pass_expired",
        payload: { tier: "premium", endAt: support.activeUntil, continuesStandard: false },
      },
    ]);
  });

  it("알림 문구는 끝나는 시각과 달라지는 점을 적는다", () => {
    const endAt = Date.UTC(2026, 10, 26, 5, 19); // 11월 26일 14:19 KST
    expect(
      supportPassNotificationText("support_pass_expiring", {
        tier: "standard",
        endAt,
        continuesStandard: false,
      }),
    ).toBe("월간 모험 지원권이 2026년 11월 26일 14:19에 끝납니다.");
    expect(
      supportPassNotificationText("support_pass_expiring", {
        tier: "premium",
        endAt,
        continuesStandard: true,
      }),
    ).toBe(
      "월간 모험 지원권 프리미엄이 2026년 11월 26일 14:19에 끝나고 일반 지원권으로 이어집니다.",
    );
    expect(
      supportPassNotificationText("support_pass_expired", {
        tier: "standard",
        endAt,
        continuesStandard: false,
      }),
    ).toBe(
      "월간 모험 지원권이 끝났습니다. 최대 스태미나 2,000, 일괄 사냥 10회로 돌아갔습니다.",
    );
    expect(
      supportPassNotificationText("support_pass_expired", {
        tier: "premium",
        endAt,
        continuesStandard: true,
      }),
    ).toBe("월간 모험 지원권 프리미엄이 끝나 일반 지원권이 적용 중입니다.");
  });
});
