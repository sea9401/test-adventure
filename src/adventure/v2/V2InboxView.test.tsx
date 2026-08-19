import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  inboxActionErrorLabel,
  type InboxItem,
} from "@/adventure/marketplace/api";
import {
  inboxClaimErrorLabel,
  InboxMailCard,
  MailDetailModal,
} from "./V2InboxView";

function inboxItem(overrides: Partial<InboxItem> = {}): InboxItem {
  return {
    id: 1,
    kind: "user_message",
    payload: { text: "새 쪽지입니다." },
    message: null,
    listingId: null,
    fromName: "보낸사람",
    recipientName: "받는사람",
    direction: "received",
    createdAt: "2026-08-09T00:00:00.000Z",
    readAt: null,
    claimedAt: null,
    hasReward: false,
    claimState: "none",
    ...overrides,
  };
}

describe("우편 거래 정지 오류", () => {
  it("유저 발송과 제한된 수령에 공통 사유와 기간 안내를 사용한다", () => {
    const message = inboxActionErrorLabel(
      {
        error: "trade_suspended",
        reason: "비정상 거래 조사",
        expiresAt: "2026-08-23T00:00:00.000Z",
        permanent: false,
      },
      403,
    );

    expect(message).toContain("거래 이용 제한");
    expect(message).toContain("비정상 거래 조사");
  });

  it("기존 수령 오류 코드는 발송용 번역 없이 원문을 유지한다", () => {
    expect(inboxClaimErrorLabel({ error: "no_unclaimed" }, 404)).toBe(
      "no_unclaimed",
    );
    expect(inboxClaimErrorLabel({ error: "inventory_full" }, 409)).toBe(
      "inventory_full",
    );
  });

  it("수령 응답이 JSON이 아니면 기존 상태 코드 fallback을 정확히 유지한다", () => {
    expect(inboxClaimErrorLabel(null, 500)).toBe("수령 실패 (500)");
  });
});

describe("MailDetailModal 장문 가독성", () => {
  it("넓은 모달과 분리된 스크롤 본문에 여유 있는 줄간격을 사용한다", () => {
    const item = inboxItem({
      payload: { text: "첫 문단입니다.\n\n두 번째 문단도 충분히 길게 표시합니다." },
      readAt: "2026-08-09T00:01:00.000Z",
      claimedAt: "2026-08-09T00:01:00.000Z",
    });

    const html = renderToStaticMarkup(
      createElement(MailDetailModal, {
        item,
        busy: false,
        onClose: vi.fn(),
        onClaim: vi.fn(),
        onRespondInvite: vi.fn(),
        onBlocked: vi.fn(),
      }),
    );

    expect(html).toContain("max-w-2xl");
    expect(html).toContain("max-h-[calc(100dvh-2rem)]");
    expect(html).toContain("overflow-y-auto");
    expect(html).toContain("leading-7");
    expect(html).toContain("첫 문단입니다");
    expect(html).toContain("두 번째 문단도 충분히 길게 표시합니다.");
  });

  it("읽음 처리 실패를 상세 모달 안에서 안내한다", () => {
    const html = renderToStaticMarkup(
      createElement(MailDetailModal, {
        item: inboxItem(),
        busy: false,
        readError: "읽음 처리 실패 (503)",
        onClose: vi.fn(),
        onClaim: vi.fn(),
        onRespondInvite: vi.fn(),
        onBlocked: vi.fn(),
      }),
    );

    expect(html).toContain("읽음 처리 실패 (503)");
  });
});

describe("InboxMailCard 상태 표시", () => {
  const handlers = {
    busy: false,
    onOpen: vi.fn(),
    onClaim: vi.fn(),
    onRespondInvite: vi.fn(),
  };

  it("미확인 받은 우편을 불투명 강조 표면과 굵은 글씨로 표시한다", () => {
    const html = renderToStaticMarkup(
      createElement(InboxMailCard, {
        ...handlers,
        item: inboxItem(),
      }),
    );

    expect(html).toContain("bg-amber-50");
    expect(html).toContain("dark:bg-amber-950");
    expect(html).toContain("font-semibold");
  });

  it("읽었지만 받지 않은 보상 우편에 미수령 상태와 수령 버튼을 남긴다", () => {
    const html = renderToStaticMarkup(
      createElement(InboxMailCard, {
        ...handlers,
        item: inboxItem({
          kind: "admin_gift",
          payload: { gold: 500 },
          message: "선물",
          readAt: "2026-08-09T00:01:00.000Z",
          hasReward: true,
          claimState: "claimable",
        }),
      }),
    );

    expect(html).toContain("미수령");
    expect(html).toContain(">수령<");
    expect(html).not.toContain("font-semibold text-zinc-800");
  });

  it("수령을 마친 우편에는 미수령 표시와 수령 버튼이 없다", () => {
    const html = renderToStaticMarkup(
      createElement(InboxMailCard, {
        ...handlers,
        item: inboxItem({
          kind: "admin_gift",
          payload: { gold: 500 },
          message: "선물",
          readAt: "2026-08-09T00:01:00.000Z",
          claimedAt: "2026-08-09T00:02:00.000Z",
          hasReward: true,
          claimState: "claimable",
        }),
      }),
    );

    expect(html).not.toContain("미수령");
    expect(html).not.toContain(">수령<");
  });
});
