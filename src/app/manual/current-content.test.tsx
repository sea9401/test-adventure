import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CombatContent } from "./content/combat";
import { ControlsContent } from "./content/controls";
import { EconomyContent } from "./content/economy";
import { EnhanceContent } from "./content/enhance";
import { EquipmentContent } from "./content/equipment";
import { GuildContent } from "./content/guild";
import { HuntingContent } from "./content/hunting";
import { JobsContent } from "./content/jobs";
import { PastimesContent } from "./content/pastimes";
import { PlazaContent } from "./content/plaza";
import { QuestsContent } from "./content/quests";
import { SkillsContent } from "./content/skills";
import { StatsContent } from "./content/stats";
import { TownContent } from "./content/town";
import { CompendiumContent } from "./content/compendium";
import { CoopContent } from "./content/coop";

describe("최신 게임 안내서 내용", () => {
  it("협동 보스 공격 비용과 단방향 전체 공개 규칙을 안내한다", () => {
    const html = renderToStaticMarkup(<CoopContent />);

    expect(html).toContain("스태미나");
    expect(html).toContain(">20<");
    expect(html).toContain("10초");
    expect(html).toContain("나만");
    expect(html).toContain("전체 공개한 뒤에는 다시 범위를 줄일 수 없습니다");
    expect(html).not.toContain("공격에는 별도 비용이 들지 않습니다");
  });

  it("공개된 7차 전직 4종의 최초 해금 조건과 영구 해금을 안내한다", () => {
    const html = renderToStaticMarkup(<JobsContent />);

    expect(html).toContain("7차 전직");
    expect(html).toContain("무영검신");
    expect(html).toContain("멸검제");
    expect(html).toContain("비천무신");
    expect(html).toContain("태초현자");
    expect(html).toContain("100,000");
    expect(html).toContain("폭풍 기원의 파편");
    expect(html).toContain("30개");
    expect(html).toContain("영구 해금");
  });

  it("전직 이력이 있는 전투 직업을 골라 수행할 수 있다고 안내한다", () => {
    const html = renderToStaticMarkup(<JobsContent />);

    expect(html).toContain("전직 이력이 있는 전투 직업");
    expect(html).toContain("현재 직업과 달라도");
    expect(html).toContain("수행 성장 직업");
  });

  it("도감 숙련의 6분야와 발견부터 전설까지의 장기 수집 단계를 안내한다", () => {
    const html = renderToStaticMarkup(<CompendiumContent />);

    expect(html).toContain("도감 숙련");
    for (const label of ["장비 연구", "어류 연구", "생태 연구", "미식 연구", "현장 연구", "직업 연구"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("발견 → 동 → 은 → 금 → 백금 → 다이아 → 전설");
    expect(html).toContain("SP·스탯·드랍률");
    expect(html).toContain("종합·분야별 영구 랭킹");
  });

  it("월간 연구의 2만점 구성과 잠정·확정 순위를 구분해 안내한다", () => {
    const html = renderToStaticMarkup(<CompendiumContent />);

    expect(html).toContain("월간 연구");
    expect(html).toContain("20,000점");
    expect(html).toContain("연구 목표 12,000");
    expect(html).toContain("다양성 5,000");
    expect(html).toContain("기록 3,000");
    expect(html).toContain("잠정 순위");
    expect(html).toContain("명예의 전당");
  });

  it("도감·월간 트로피의 6단계와 대표 3종 전시를 안내한다", () => {
    const quests = renderToStaticMarkup(<QuestsContent />);
    const plaza = renderToStaticMarkup(<PlazaContent />);

    expect(quests).toContain("도감 숙련");
    expect(quests).toContain("월간 연구");
    expect(quests).toContain("동·은·금·백금·다이아·전설");
    expect(quests).toContain("대표 트로피 3종");
    expect(quests).toContain("업적 점수에는 더하지 않습니다");
    expect(plaza).toContain("도감 숙련");
    expect(plaza).toContain("월간 연구");
    expect(plaza).toContain("명예의 전당");
  });

  it("정신의 마법 공격 보조와 초과 정신 추가 전환을 안내한다", () => {
    const stats = renderToStaticMarkup(<StatsContent />);
    const combat = renderToStaticMarkup(<CombatContent />);

    expect(stats).toContain("마법 공격 보조");
    expect(stats).toContain("지능을 초과한 정신");
    expect(combat).toContain("마법 공격력은 INT가 주축이고 SPI가 보조");
  });

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
    expect(html).toContain("14·21일차");
    expect(html).toContain("지원권 7일");
    expect(html).toContain("빨간");
    expect(html).toContain("프로필 이미지");
    expect(html).toContain("회원 탈퇴");
    expect(html).toContain("영구 삭제");
  });

  it("게임 홍보의 여섯 단계 튜토리얼 보상을 안내한다", () => {
    const html = renderToStaticMarkup(<ControlsContent />);

    expect(html).toContain("사냥터 깊이 24·36");
    expect(html).toContain("길드 가입 또는 창단");
    expect(html).toContain("최고 생활 레벨 5·10");
    expect(html).toContain("단계마다 양쪽에 스태미나 회복약 2개");
    expect(html).toContain("각자 최대 12개");
    expect(html).not.toContain("지정된 사냥터의 최심부");
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

  it("최소 피해 하한과 반사의 실제 적용 순서를 안내한다", () => {
    const html = renderToStaticMarkup(<CombatContent />);

    expect(html).toContain("유효 공격력의 15%");
    expect(html).toContain("85% × 방어력 ÷ (방어력 + 500)");
    expect(html).toContain("공격력 − 방어력");
    expect(html).toContain("최종 HP 피해는");
    expect(html).toContain("최소 데미지");
    expect(html).toContain("물리 스킬은");
    expect(html).toContain("STR·VIT");
    expect(html).toContain("마법 스킬은");
    expect(html).toContain("INT·SPI");
    expect(html).toContain("전투 시작 방어력");
    expect(html).toContain("가드 등으로 최종 HP 피해가 0이어도 반사가 발생");
    expect(html).toContain("보호막이 공격을 전부 흡수하면 반사와 피격 반격은 발동하지 않습니다");
    expect(html).not.toContain("어느 쪽이든 방어가 아무리");
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

  it("위험 해역의 해금·조작·화물 확정·사고 구조를 안내한다", () => {
    const html = renderToStaticMarkup(<PastimesContent />);

    expect(html).toContain("위험 해역 낚시");
    expect(html).toContain("Lv.15");
    expect(html).toContain("돌진");
    expect(html).toContain("줄 풀기");
    expect(html).toContain("몸부림·잠수");
    expect(html).toContain("버티기");
    expect(html).toContain("어체력과 거리");
    expect(html).toContain("안전 귀환");
    expect(html).toContain("위험도 3");
    expect(html).toContain("12%");
    expect(html).toContain("위험도 5");
    expect(html).toContain("32%");
    expect(html).toContain("전용 낚싯대·릴·낚싯줄");
    expect(html).toContain("위험 해역 교환");
    expect(html).toContain("일반 어획물 4개");
    expect(html).toContain("레비아탄 낚싯대");
    expect(html).toContain("심해의 지배자");
    expect(html).toContain("서로 다른 어종을 섞어");
    expect(html).toContain("거래소에서 거래할 수 있지만 NPC에게 판매할 수는 없습니다");
  });

  it("어종 표본의 등록 권리 이전과 어획 기록 보존을 안내한다", () => {
    const pastimes = renderToStaticMarkup(<PastimesContent />);
    const plaza = renderToStaticMarkup(<PlazaContent />);

    expect(pastimes).toContain("어종 표본");
    expect(pastimes).toContain("등록 권리");
    expect(pastimes).toContain("어획 기록은 유지");
    expect(pastimes).toContain("장착 스킬");
    expect(plaza).toContain("어종 표본");
    expect(plaza).toContain("다시 추출해 판매");
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

  it("스킬 패턴의 확률 폴백·공유 판정과 전투 프리셋 범위를 안내한다", () => {
    const html = renderToStaticMarkup(<SkillsContent />);

    expect(html).toContain("발동 확률");
    expect(html).toContain("1순위가 확률 판정에 실패하면 2순위");
    expect(html).toContain("같은 발동 판정값을 공유");
    expect(html).toContain("독립된 재도전 횟수가 늘어나지 않습니다");
    expect(html).toContain("최대 5개 슬롯");
    expect(html).toContain("장착 스킬·전투 패턴·장비");
  });

  it("마나 실드의 성장식·피해 순서·예외와 복합 스킬 규칙을 안내한다", () => {
    const combat = renderToStaticMarkup(<CombatContent />);
    const skills = renderToStaticMarkup(<SkillsContent />);

    expect(combat).toContain("최대 MP의 60% + (INT − 15) × 2");
    expect(combat).toContain("45% × (INT − 15) ÷ ((INT − 15) + 250)");
    expect(combat).toContain("30% × 최대 내구도 ÷ (최대 내구도 + 1,500)");
    expect(combat).toContain("방어·마법 방어·회피보다 먼저");
    expect(combat).toContain("지속 피해·반사·반격·일반 상태 피해");
    expect(combat).toContain("고정·처형·보호막 무시·자해·HP 비용");
    expect(combat).toContain("현재 MP는 소모하지");
    expect(combat).toContain("전투 시작 시점");

    expect(skills).toContain("복합 스킬 효과 읽는 법");
    expect(skills).toContain("중첩과 상한");
    expect(skills).toContain("반사와 반격");
    expect(skills).toContain("전투당 1회 생존");
    expect(skills).toContain("HP 비용과 보호막 우회");
    expect(skills).toContain("PvE·PvP 차이");
  });

  it("천공 균열·별의 무덤 장비 풀과 폭풍 원정 연습 모드를 안내한다", () => {
    const hunting = renderToStaticMarkup(<HuntingContent />);
    const equipment = renderToStaticMarkup(<EquipmentContent />);
    const compendium = renderToStaticMarkup(<CompendiumContent />);

    expect(hunting).toContain("연습 모드");
    expect(hunting).toContain("일일 입장 횟수를 소모하지 않고");
    expect(hunting).toContain("연결된 다음 노드");
    expect(hunting).toContain("미리보기 후 이동을 확정");
    expect(hunting).toContain("공용 보급과 폭풍 제단");
    expect(hunting).toContain("지나온 노드로 돌아갈 수 없습니다");
    expect(hunting).toContain("천공 균열 73~78단계");
    expect(hunting).toContain("같은 6티어 전역 후보 풀");
    expect(hunting).toContain("시그니처 유니크 12종도 전 구간");
    expect(hunting).toContain("별의 무덤 79~84단계");
    expect(hunting).toContain("총 0.0035%");
    expect(hunting).toContain("경험치와 골드");
    expect(hunting).toContain("천공 균열 78단계와 동일");
    expect(equipment).toContain("난이도와 관계없이 같은 6티어");
    expect(compendium).toContain("난이도에 따라 후보가 바뀌지 않고");
    expect(compendium).toContain("시그니처 유니크 12종은 천공 균열 전");
    expect(compendium).toContain("별의 무덤");
    expect(compendium).toContain("0.0035%");
  });

  it("숙련의 탑 첫 입장 비용·재입장 대기·50층 연습을 함께 안내한다", () => {
    const html = renderToStaticMarkup(<JobsContent />);

    expect(html).toContain("하루 첫 실제 전투에만 스태미나");
    expect(html).toContain(">200<");
    expect(html).toContain(">30초<");
    expect(html).toContain("50층 수호자에게 연습 재도전");
    expect(html).toContain("추가 스태미나도 들지");
  });

  it("현재 우편함의 통합 받은 우편과 전체 수령 동작을 안내한다", () => {
    const html = renderToStaticMarkup(<PlazaContent />);

    expect(html).toContain("미확인·미수령·수령 완료 우편이 한 목록");
    expect(html).toContain("전체 수령");
    expect(html).not.toContain("지난 우편");
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
    expect(html).toContain("별표로 즐겨찾기에 저장");
    expect(html).toContain("즐겨찾기 필터");
  });

  it("폭풍 개량의 대상·비용·되돌릴 수 없는 제한을 안내한다", () => {
    const html = renderToStaticMarkup(<EnhanceContent />);

    expect(html).toContain("비세트 특화 유니크");
    expect(html).toContain("세트 효과가 전혀 없는 장비");
    expect(html).toContain("10,000,000 G");
    expect(html).toContain("폭풍 심장 조각");
    expect(html).toContain("재련은 할 수 없습니다");
    expect(html).toContain("되돌릴 수 없습니다");
    expect(html).toContain("폭풍 기원의 파편은 개량 재료로 사용하지 않습니다");
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
