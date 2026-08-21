import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("V2CodexView tab bundle boundaries", () => {
  it("loads independent codex panels through dynamic imports", () => {
    const source = readFileSync("src/adventure/v2/V2CodexView.tsx", "utf8");
    const panels = [
      "V2JobCodexView",
      "CodexEquipmentPanel",
      "CodexTitlePanel",
      "LifeFieldPanels",
      "CookingCodexPanel",
      "FishingCodexPanel",
      "CodexMasteryPanel",
    ];

    for (const panel of panels) {
      expect(source).toContain(`import("./${panel}")`);
    }
  });
});
