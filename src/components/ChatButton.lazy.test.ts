import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ChatButton bundle boundary", () => {
  it("loads the large chat panel only after the user opens chat", () => {
    const source = readFileSync("src/components/ChatButton.tsx", "utf8");

    expect(source).not.toContain(
      'import { ChatPanel, type ChatMessage } from "./ChatPanel"',
    );
    expect(source).toContain('import("./ChatPanel")');
    expect(source).toContain("panelActivated && (");
  });
});
