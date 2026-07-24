import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { V2CharacterCard } from "./V2CharacterCard";

describe("V2CharacterCard profile theme", () => {
  it("keeps the header shadow off chroma nicknames", () => {
    const html = renderToStaticMarkup(
      <V2CharacterCard
        character={{
          name: "빛나는모험가",
          level: 42,
          exp: 120,
          expToNext: 500,
          hp: 90,
          maxHp: 100,
          mp: 45,
          maxMp: 60,
          gold: 1234,
        }}
        profileBorder="infernal"
        chatNameEffect="spectrum"
      />,
    );

    expect(html).toContain("ui-profile-theme-header");
    expect(html).toMatch(/ui-chat-name-chroma[^\"]*truncate text-white/);
    expect(html).not.toMatch(
      /ui-chat-name-chroma[^\"]*ui-profile-theme-copy/,
    );
    expect(html).toMatch(/ui-profile-theme-copy text-sm/);
  });
});
