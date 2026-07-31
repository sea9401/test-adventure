import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ControlsContent } from "./content/controls";
import { GuildContent } from "./content/guild";
import { PastimesContent } from "./content/pastimes";
import { PlazaContent } from "./content/plaza";
import { TownContent } from "./content/town";

describe("최신 게임 안내서 내용", () => {
  it("세 가지 화면 모드의 표시 방식과 저장 동작을 안내한다", () => {
    const html = renderToStaticMarkup(<ControlsContent />);

    expect(html).toContain("기본 모드");
    expect(html).toContain("배경 숨김");
    expect(html).toContain("은신 모드");
    expect(html).toContain("장면 배경만 끄고");
    expect(html).toContain("그대로 유지");
    expect(html).toContain("스프레드시트");
    expect(html).toContain("현재 브라우저에 저장");
    expect(html).toContain("메뉴(☰) → 환경 설정");
  });

  it("독립 주방과 거래 가능한 개인 요리를 안내한다", () => {
    const town = renderToStaticMarkup(<TownContent />);
    const pastimes = renderToStaticMarkup(<PastimesContent />);

    expect(town).toContain("농장과 별도의 생활 메뉴");
    expect(pastimes).toContain("즐겨찾기");
    expect(pastimes).toContain("거래소의 소모품");
    expect(pastimes).toContain("최대 <strong");
  });

  it("길드 훈련과 원정의 전체 성장 단계를 안내한다", () => {
    const html = renderToStaticMarkup(<GuildContent />);

    expect(html).toContain("전술 모의전");
    expect(html).toContain("별빛 성채 대원정");
    expect(html).toContain("총 <strong");
  });

  it("공개 화면에서 접속자 정보를 제공하지 않는다고 안내한다", () => {
    const html = renderToStaticMarkup(<PlazaContent />);

    expect(html).toContain("일반 이용자에게 공개되지 않습니다");
  });
});
