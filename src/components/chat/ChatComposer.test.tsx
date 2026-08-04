import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatComposer } from "./ChatComposer";

describe("ChatComposer", () => {
  it("모바일 입력 글자를 16px로 유지하고 좁은 화면에서 입력칸이 줄어든다", () => {
    const html = renderToStaticMarkup(
      <ChatComposer draft="테스트" onDraftChange={() => {}} onSubmit={() => {}} />,
    );

    expect(html).toContain("min-w-0");
    expect(html).toContain("text-base");
    expect(html).toContain("sm:text-sm");
  });
});
