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
  it("shows slot, equipment, and set names together for equipped items", () => {
    const html = renderToStaticMarkup(
      <V2CharacterCard
        character={CHARACTER}
        equipped={{
          weapon: "weapon-iid",
          armor: "armor-iid",
          ring: "ring-iid",
        }}
        owned={[
          { iid: "weapon-iid", id: "v2_iron_sword" },
          { iid: "armor-iid", id: "v2_canyon_set_armor" },
          { iid: "ring-iid", id: "v2_crafted_combo_ring" },
        ]}
      />,
    );

    expect(html).toContain("장착 장비");
    expect(html).toContain("부위 · 장비 · 세트");
    expect(html).toContain("무기: 철검, 세트 없음");
    expect(html).toContain("갑옷: 황토 흉갑, 세트 · 마른땅 갑주");
    expect(html).toContain("반지: 연환 반지, 세트 · 연격각인 장비");
  });

  it("labels character growth as combat level and separates production-job advancement", () => {
    const html = renderToStaticMarkup(
      <V2CharacterCard
        character={{ ...CHARACTER, classDisplayName: "원예가" }}
        levelCap={100}
        rejobRequiredLevel={1}
      />,
    );

    expect(html).toContain("전투 Lv 42 / 100");
    expect(html).toContain("전직 레벨 제한 없음");
    expect(html).not.toContain(">전투 Lv 42 / 1<");
  });

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

  it("renders the representative trophies as a compact full-width row", () => {
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
        onOpenTrophies={() => undefined}
      />,
    );

    expect(html).toContain("대표 트로피");
    expect(html).toContain(title.name);
    expect(html).toContain("트로피 전시대 열기");
    expect(html).toContain("2번 배지 선택");
    expect(html).toContain("3번 배지 선택");
    expect(html).not.toContain("잠김");
    expect(html).not.toContain("sm:grid-cols-[7rem_minmax(0,1fr)_minmax(15rem,1fr)]");
    expect(html).toContain("col-span-2 min-w-0");
  });

  it("shows only the selected medal on a public profile", () => {
    const html = renderToStaticMarkup(
      <V2CharacterCard
        character={CHARACTER}
        profileBadgeStandOwned
        profileShowcaseSlots={[
          { kind: "achievement", achievementId: "combat_100" },
          null,
          null,
        ]}
      />,
    );

    expect(html).toContain("백전");
    expect(html).not.toContain("clip-path");
    expect(html).toContain("size-8");
    expect(html).not.toContain("잠김");
    expect(html).not.toContain("대표 배지 편집");
  });

  it("does not show or reserve the badge stand before purchase", () => {
    const html = renderToStaticMarkup(
      <V2CharacterCard
        character={CHARACTER}
        profileShowcaseSlots={[
          { kind: "achievement", achievementId: "combat_100" },
          null,
          null,
        ]}
        showcaseEditable
      />,
    );

    expect(html).not.toContain("대표 트로피");
    expect(html).not.toContain("코인 상점에서 보기");
    expect(html).not.toContain("백전");
    expect(html).not.toContain("col-span-2 min-w-0");
  });

  it("hides a disabled stand publicly but keeps its owner control available", () => {
    const slots = [
      { kind: "achievement" as const, achievementId: "combat_100" },
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

    expect(publicHtml).not.toContain("대표 트로피");
    expect(publicHtml).not.toContain("백전");
    expect(ownerHtml).toContain("대표 트로피 비공개");
    expect(ownerHtml).toContain("공개하기");
  });
});
