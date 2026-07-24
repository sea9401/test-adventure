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

  it("renders the badge rack in its own responsive column", () => {
    const title = Object.values(TITLES)[0];
    const html = renderToStaticMarkup(
      <V2CharacterCard
        character={CHARACTER}
        profileBadgeStandOwned
        profileShowcaseSlots={[
          { kind: "title", titleId: title.id },
          null,
          null,
        ]}
        showcaseEditable
      />,
    );

    expect(html).toContain("대표 배지 전시대");
    expect(html).toContain(title.name);
    expect(html).toContain("대표 배지 편집");
    expect(html).toContain("2번 칸");
    expect(html).toContain("3번 칸");
    expect(html).not.toContain("잠김");
    expect(html).toContain("sm:grid-cols-[7rem_minmax(0,1fr)_minmax(13rem,0.95fr)]");
    expect(html).toContain("col-span-2 min-w-0 sm:col-span-1");
  });

  it("shows only the selected medal on a public profile", () => {
    const html = renderToStaticMarkup(
      <V2CharacterCard
        character={CHARACTER}
        profileBadgeStandOwned
        profileShowcaseSlots={[
          { kind: "achievement", achievementId: "combat_10" },
          null,
          null,
        ]}
      />,
    );

    expect(html).toContain("몸풀기");
    expect(html).toContain("5점");
    expect(html).not.toContain("잠김");
    expect(html).not.toContain("대표 배지 편집");
  });

  it("does not show or reserve the badge stand before purchase", () => {
    const html = renderToStaticMarkup(
      <V2CharacterCard
        character={CHARACTER}
        profileShowcaseSlots={[
          { kind: "achievement", achievementId: "combat_10" },
          null,
          null,
        ]}
        showcaseEditable
      />,
    );

    expect(html).not.toContain("대표 배지 전시대");
    expect(html).not.toContain("코인 상점에서 보기");
    expect(html).not.toContain("몸풀기");
    expect(html).not.toContain("col-span-2 min-w-0 sm:col-span-1");
  });

  it("hides a disabled stand publicly but keeps its owner control available", () => {
    const slots = [
      { kind: "achievement" as const, achievementId: "combat_10" },
      null,
      null,
    ] as const;
    const publicHtml = renderToStaticMarkup(
      <V2CharacterCard
        character={CHARACTER}
        profileBadgeStandOwned
        profileBadgeStandVisible={false}
        profileShowcaseSlots={[...slots]}
      />,
    );
    const ownerHtml = renderToStaticMarkup(
      <V2CharacterCard
        character={CHARACTER}
        profileBadgeStandOwned
        profileBadgeStandVisible={false}
        profileShowcaseSlots={[...slots]}
        showcaseEditable
      />,
    );

    expect(publicHtml).not.toContain("대표 배지 전시대");
    expect(publicHtml).not.toContain("몸풀기");
    expect(ownerHtml).toContain("대표 배지 전시대 비공개");
    expect(ownerHtml).toContain("공개하기");
  });
});
