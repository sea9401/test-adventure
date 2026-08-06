import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CombatContent } from "./content/combat";
import { ControlsContent } from "./content/controls";
import { EconomyContent } from "./content/economy";
import { GuildContent } from "./content/guild";
import { HuntingContent } from "./content/hunting";
import { JobsContent } from "./content/jobs";
import { PastimesContent } from "./content/pastimes";
import { PlazaContent } from "./content/plaza";
import { QuestsContent } from "./content/quests";
import { SkillsContent } from "./content/skills";
import { TownContent } from "./content/town";

describe("최신 게임 안내서 내용", () => {
  it("네 가지 화면 모드의 표시 방식과 저장 동작을 안내한다", () => {
    const html = renderToStaticMarkup(<ControlsContent />);

    expect(html).toContain("기본 모드");
    expect(html).toContain("배경 숨김");
    expect(html).toContain("은신 모드");
    expect(html).toContain("터미널 모드");
    expect(html).toContain("검은 배경");
    expect(html).toContain("장면 배경만 끄고");
    expect(html).toContain("그대로 유지");
    expect(html).toContain("스프레드시트");
    expect(html).toContain("현재 브라우저에 저장");
    expect(html).toContain("메뉴(☰) → 환경 설정");
  });

  it("알림·출석 혜택·계정 관리의 현재 위치를 안내한다", () => {
    const html = renderToStaticMarkup(<ControlsContent />);

    expect(html).toContain("일반 알림");
    expect(html).toContain("월간 모험 지원권");
    expect(html).toContain("빨간");
    expect(html).toContain("프로필 이미지");
    expect(html).toContain("회원 탈퇴");
    expect(html).toContain("영구 삭제");
  });

  it("사냥 패배 위험 골드와 지역 세금 폐지를 모순 없이 안내한다", () => {
    const combat = renderToStaticMarkup(<CombatContent />);
    const hunting = renderToStaticMarkup(<HuntingContent />);
    const economy = renderToStaticMarkup(<EconomyContent />);

    expect(combat).toContain("위험 골드");
    expect(combat).toContain("50%");
    expect(combat).toContain("시간초과는 골드 페널티에서");
    expect(hunting).toContain("은행 예치금");
    expect(hunting).toContain("골드 페널티 계산에서 무승부");
    expect(economy).toContain("지역 세금은 붙지 않습니다");
    expect(combat).not.toContain("패배해도 페널티는 없습니다");
    expect(hunting).not.toContain("추가 손실은 없습니다");
  });

  it("독립 주방과 거래 가능한 개인 요리를 안내한다", () => {
    const town = renderToStaticMarkup(<TownContent />);
    const pastimes = renderToStaticMarkup(<PastimesContent />);

    expect(town).toContain("농장과 별도의 생활 메뉴");
    expect(pastimes).toContain("즐겨찾기");
    expect(pastimes).toContain("거래소의 소모품");
    expect(pastimes).toContain("최대 <strong");
  });

  it("마을에서 생활 의뢰·조합 작업장으로 바로 이동할 수 있다고 안내한다", () => {
    const html = renderToStaticMarkup(<TownContent />);

    expect(html).toContain("생활 의뢰·조합 작업장");
    expect(html).toContain("마을 탭의 독립된 시설 카드에서 바로 이동");
  });

  it("최신 낚시 코인과 소비품 구매 한도를 안내한다", () => {
    const html = renderToStaticMarkup(<PastimesContent />);

    expect(html).toContain("기본 챔질 코인");
    expect(html).toContain("8코인");
    expect(html).toContain("15코인");
    expect(html).toContain("농장 씨앗 주머니");
    expect(html).toContain("같은 날 살 때마다 가격이 오릅니다");
  });

  it("생활 튜토리얼과 SP 수집 보너스를 안내한다", () => {
    const quests = renderToStaticMarkup(<QuestsContent />);
    const skills = renderToStaticMarkup(<SkillsContent />);

    expect(quests).toContain("농장·벌목·채광·");
    expect(quests).toContain("낚시·요리");
    expect(quests).toContain("대표 배지 전시대");
    expect(quests).toContain("모두 받기");
    expect(quests).toContain("수령 후 공개되는");
    expect(skills).toContain("장비 도감·어보 수집 단계");
  });

  it("전직 로드맵에서 생산직과 생존자 전투 직업을 구분한다", () => {
    const html = renderToStaticMarkup(<JobsContent />);

    expect(html).toContain("manual-job-production");
    expect(html).toContain("생산직 · 전투 Lv 제한 없음");
    expect(html).toContain("초록색으로 강조된 생산직");
    expect(html).toContain("헬스 트레이너처럼");
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

  it("거래소 즉시구매 기본값과 선택형 공개 입찰 정산 흐름을 안내한다", () => {
    const html = renderToStaticMarkup(<PlazaContent />);

    expect(html).toContain("기본 판매 방식은");
    expect(html).toContain("등록 즉시 살 수 있고");
    expect(html).toContain("같은 품목의 매물이 한 줄로 합쳐지며");
    expect(html).toContain("최저가 매물부터");
    expect(html).toContain("별표 즐겨찾기");
    expect(html).toContain("최근 30일 체결가 추이");
    expect(html).toContain("구매 주문 골드는 등록 시");
    expect(html).toContain("가격 알림에 목표 개당 가격");
    expect(html).toContain("판매 관리에서 가격을 변경");
    expect(html).toContain("공개 입찰 유예");
    expect(html).toContain("2~");
    expect(html).toContain("24시간");
    expect(html).toContain("최고 입찰자에게 판매");
    expect(html).toContain("판매자가 취소할 수 없습니다");
  });
});
