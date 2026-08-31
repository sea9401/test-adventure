import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SendMessageModal } from "./SendMessageModal";

describe("SendMessageModal 장문 작성 가독성", () => {
  it("작성 모달과 입력창을 넓고 높게 표시한다", () => {
    const html = renderToStaticMarkup(
      createElement(SendMessageModal, {
        initialRecipient: "받는사람",
        onClose: vi.fn(),
      }),
    );

    expect(html).toContain("max-w-xl");
    expect(html).toContain("min-h-48");
    expect(html).toContain("resize-y");
    expect(html).toContain("leading-6");
  });
});
