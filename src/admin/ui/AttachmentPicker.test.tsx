import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AttachmentPicker } from "./AttachmentPicker";

describe("AttachmentPicker", () => {
  it("분류 목록은 분류와 아이템 선택기를 따로 표시한다", () => {
    const html = renderToStaticMarkup(
      <AttachmentPicker
        label="재료 첨부"
        groups={[
          {
            id: "general",
            label: "일반·기타 재료",
            options: [{ id: "normal", name: "일반 재료", label: "일반 재료" }],
          },
          {
            id: "unexplored",
            label: "미개척지 보스 소환석",
            options: [{ id: "stone", name: "소환석", label: "소환석" }],
          },
        ]}
        entries={[]}
        onChange={() => {}}
        disabled={false}
      />,
    );

    expect(html).toContain(">분류<");
    expect(html).toContain("일반·기타 재료");
    expect(html).toContain("미개척지 보스 소환석");
    expect(html).toContain(">재료 첨부<");
    expect(html).toContain("일반 재료");
  });
});
