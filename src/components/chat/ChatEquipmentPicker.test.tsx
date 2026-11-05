// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatEquipmentPicker } from "./ChatEquipmentPicker";

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/adventure/data/v2/coreLoopConfig")>()),
  V2_EQUIPMENT_LIBERATION: true,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ChatEquipmentPicker", () => {
  it("마법부여된 장비만 단계와 줄수를 표시해 고를 수 있게 한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          owned: [
            {
              iid: "eq-liberated",
              id: "v2_boss_catastrophe_gloves",
              liberation: {
                rank: 2,
                lineCount: 2,
                revision: 7,
                options: [
                  { id: "base_str_pct", level: 10 },
                  { id: "skill_crit_damage_pp", level: 8 },
                ],
              },
            },
            { iid: "eq-plain", id: "v2_iron_sword" },
          ],
        }),
      ),
    );

    render(
      <ChatEquipmentPicker open onClose={() => {}} onSelect={() => {}} />,
    );

    expect(await screen.findByText("철검")).toBeTruthy();
    expect(screen.getAllByText("마법부여 2단계 · 2줄")).toHaveLength(1);
  });
});
