// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseChatEquipmentLink } from "@/lib/chat-item-link";
import { MessageBody } from "./MessageBody";

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/adventure/data/v2/coreLoopConfig")>()),
  V2_EQUIPMENT_LIBERATION: true,
}));

afterEach(() => {
  cleanup();
});

describe("MessageBody item links", () => {
  it("마법 부여된 장비 링크를 열면 전송 당시 옵션을 표시한다", () => {
    const itemLink = parseChatEquipmentLink({
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
    });

    render(<MessageBody content="" itemLink={itemLink} />);
    fireEvent.click(screen.getByRole("button", { name: /아이템 옵션 보기/ }));

    expect(screen.getByText("해방 옵션")).toBeTruthy();
    expect(screen.getByText("기초 STR +4.5%")).toBeTruthy();
    expect(screen.getByText("스킬 치명타 피해 +16%p")).toBeTruthy();
  });
});
