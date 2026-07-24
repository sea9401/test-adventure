import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { V2CharacterCard } from "./V2CharacterCard";
import { TITLES } from "@/adventure/data/titles";

const CHARACTER = {
  name: "빛나는모험가",
  level: 42,
  exp: 120,
  expToNext: 500,
  hp: 90,
  maxHp: 100,
  mp: 45,
  maxMp: 60,
  gold: 1234,
};

describe("V2CharacterCard profile theme", () => {
  it("keeps the header shadow off chroma nicknames", () => {
    const html = renderToStaticMarkup(
      <V2CharacterCard
        character={CHARACTER}
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

  it("renders the showcase in its own responsive column", () => {
    const title = Object.values(TITLES)[0];
    const html = renderToStaticMarkup(
      <V2CharacterCard
        character={CHARACTER}
        profileShowcase={{ kind: "title", titleId: title.id }}
        showcaseEditable
      />,
    );

    expect(html).toContain("프로필 쇼케이스");
    expect(html).toContain(`「${title.name}」`);
    expect(html).toContain("쇼케이스 편집");
    expect(html).toContain("sm:grid-cols-[7rem_minmax(0,1fr)_minmax(13rem,0.95fr)]");
    expect(html).toContain("col-span-2 min-w-0 sm:col-span-1");
  });
});
