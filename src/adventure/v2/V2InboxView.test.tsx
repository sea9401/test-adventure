import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { InboxItem } from "@/adventure/marketplace/api";
import { MailDetailModal } from "./V2InboxView";

describe("MailDetailModal 장문 가독성", () => {
  it("넓은 모달과 분리된 스크롤 본문에 여유 있는 줄간격을 사용한다", () => {
    const item: InboxItem = {
      id: 1,
      kind: "user_message",
      payload: { text: "첫 문단입니다.\n\n두 번째 문단도 충분히 길게 표시합니다." },
      message: null,
      listingId: null,
      fromName: "보낸사람",
      recipientName: "받는사람",
      direction: "received",
      createdAt: "2026-08-09T00:00:00.000Z",
      claimedAt: "2026-08-09T00:01:00.000Z",
    };

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
});
