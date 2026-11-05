import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChatComposer } from "./ChatComposer";

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/adventure/data/v2/coreLoopConfig")>()),
  V2_EQUIPMENT_LIBERATION: true,
}));

describe("ChatComposer", () => {
  it("모바일 입력 글자를 16px로 유지하고 좁은 화면에서 입력칸이 줄어든다", () => {
    const html = renderToStaticMarkup(
      <ChatComposer
        draft="테스트"
        onDraftChange={() => {}}
        onOpenItemPicker={() => {}}
        onRemoveItemLink={() => {}}
        onSubmit={() => {}}
      />,
    );

    expect(html).toContain("min-w-0");
    expect(html).toContain("text-base");
    expect(html).toContain("sm:text-sm");
    expect(html).toContain("보유 장비 링크 첨부");
  });

  it("본문 없이 장비만 첨부해도 전송할 수 있다", () => {
    const html = renderToStaticMarkup(
      <ChatComposer
        draft=""
        itemLink={{ kind: "equipment", itemId: "v2_iron_sword" }}
        onDraftChange={() => {}}
        onOpenItemPicker={() => {}}
        onRemoveItemLink={() => {}}
        onSubmit={() => {}}
      />,
    );

    expect(html).toContain("철검");
    expect(html).toContain("옵션 첨부");
    expect(html).not.toContain('aria-label="전송" disabled=""');
  });

  it("첨부한 장비의 마법부여 단계와 줄수를 전송 전에 보여 준다", () => {
    const html = renderToStaticMarkup(
      <ChatComposer
        draft=""
        itemLink={{
          kind: "equipment",
          itemId: "v2_boss_catastrophe_gloves",
          liberation: {
            rank: 2,
            lineCount: 2,
            revision: 7,
            options: [
              { id: "base_str_pct", level: 10 },
              { id: "skill_crit_damage_pp", level: 8 },
            ],
          },
        }}
        onDraftChange={() => {}}
        onOpenItemPicker={() => {}}
        onRemoveItemLink={() => {}}
        onSubmit={() => {}}
      />,
    );

    expect(html).toContain("마법부여 2단계 · 2줄");
    expect(html).not.toContain("옵션 첨부");
  });
});
