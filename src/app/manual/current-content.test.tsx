import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DANGEROUS_BAITS } from "@/adventure/data/v2/dangerousFishing";
import {
  DANGEROUS_REALTIME_BALANCE_REVISION,
  DANGEROUS_REALTIME_RETAINED_DURATION_PERMILLE,
  dangerousRealtimeEffectiveModifierProjection,
} from "@/adventure/v2/dangerousFishingRealtime";
import { dangerousRealtimeModifiers } from "@/adventure/v2/dangerousFishingRealtimeModifiers";
import { dangerousBaitRealtimeEffectCopy } from "@/adventure/v2/dangerousFishingBaitCopy";
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
import { OverviewContent } from "./content/overview";

describe("최신 게임 안내서 내용", () => {
  it("힘·지능의 공격 환산과 힘·활력의 최대 HP 환산을 안내한다", () => {
    const stats = renderToStaticMarkup(<StatsContent />);
    const combat = renderToStaticMarkup(<CombatContent />);

    expect(stats).toContain("힘 1당 공격력 0.7");
    expect(stats).toContain("힘 1당 최대 HP 1");
    expect(stats).toContain("활력 1당 최대 HP 3");
    expect(stats).toContain("지능 1당 마법 공격력 0.7");
    expect(combat).toContain("힘 1당 공격력 0.7");
    expect(combat).toContain("지능 1당 마법 공격력 0.7");
  });

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

  it("폭풍 원정의 일괄 진행 계획·위험·중단과 재개 규칙을 안내한다", () => {
    const html = renderToStaticMarkup(<HuntingContent />);

    expect(html).toContain("직접 진행과 일괄 진행");
    expect(html).toContain("외곽·중층·수호자");
    expect(html).toContain("공격·생존·자원");
    expect(html).toContain("위험 이벤트는 자동으로 지나칩니다");
    expect(html).toContain("자동 귀환하지 않습니다");
    expect(html).toContain("일괄 진행 재개");
    expect(html).toContain("현재 요청이 끝난 뒤");
  });

  it("게시판 활동 점수·일일 인정 한도와 Lv.20 칭호를 안내한다", () => {
    const html = renderToStaticMarkup(<PlazaContent />);

    expect(html).toContain("게시글 3점");
    expect(html).toContain("댓글 1점");
    expect(html).toContain("받은 좋아요 4점");
    expect(html).toContain("게시글 2개·댓글 5개");
    expect(html).toContain("Lv.15");
    expect(html).toContain("광장 원로");
    expect(html).toContain("Lv.20");
    expect(html).toContain("광장의 전설");
  });

  it("거래 이용 제한 중 가능한 조회·취소·정산과 제한 행위를 안내한다", () => {
    const html = renderToStaticMarkup(<PlazaContent />);

    expect(html).toContain("거래 이용 제한");
    expect(html).toContain("거래 정보 조회");
    expect(html).toContain("신규 등록·구매·입찰·구매 주문·선물");
    expect(html).toContain("취소·정산·환불");
  });

  it("장비 등록 상태와 공용 스킬 상세, 전투 기록 틱 표시를 안내한다", () => {
    const compendium = renderToStaticMarkup(<CompendiumContent />);
    const skills = renderToStaticMarkup(<SkillsContent />);
    const combat = renderToStaticMarkup(<CombatContent />);

    expect(compendium).toContain("등록·미등록");
    expect(skills).toContain("스킬 상세 보기");
    expect(skills).toContain("스킬 학습·장착");
    expect(skills).toContain("전직 로드맵");
    expect(skills).toContain("SP·MP·발동 확률·재사용 대기");
    expect(combat).toContain("현재 틱 / 전체 틱");
    expect(combat).toContain("같은 틱 안의 사건 순서");
  });

  it("게임 개요에서 도감 숙련과 월간 연구를 장기 목표로 안내한다", () => {
    const html = renderToStaticMarkup(<OverviewContent />);

    expect(html).toContain("도감 숙련");
    expect(html).toContain("월간 연구");
    expect(html).toContain("전투력 보상 없이");
  });

  it("정신의 마법 공격 보조와 초과 정신 추가 전환을 안내한다", () => {
    const stats = renderToStaticMarkup(<StatsContent />);
    const combat = renderToStaticMarkup(<CombatContent />);

    expect(stats).toContain("마법 공격 보조");
    expect(stats).toContain("지능을 초과한 정신");
    expect(combat).toContain("마법 공격력은 INT가 주축이고 SPI가 보조");
  });

  it("무기 종류에 따른 물리·마법 공격력 분기를 안내한다", () => {
    const combat = renderToStaticMarkup(<CombatContent />);
    const equipment = renderToStaticMarkup(<EquipmentContent />);

    expect(combat).toContain("비지팡이 무기 위력");
    expect(combat).toContain("지팡이 위력");
    expect(equipment).toContain("비지팡이: 물리 공격력 / 지팡이: 마법 공격력");
    expect(equipment).not.toContain("물리 공격력 + 마법 공격력 (양쪽 모두)");
  });

  it("네 가지 화면 모드의 표시 방식과 저장 동작을 안내한다", () => {
    const html = renderToStaticMarkup(<ControlsContent />);

    expect(html).toContain("트로피 전시대");
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
    expect(pastimes).toContain("총 <strong");
    expect(pastimes).toContain("정확히 <strong");
    expect(pastimes).toContain("성능 +10%");
    expect(pastimes).toContain("영구 선택");
  });

  it("농장 후반 교환소의 해금과 반복 상품을 안내한다", () => {
    const html = renderToStaticMarkup(<PastimesContent />);

    expect(html).toContain("농장주의 교환소");
    expect(html).toContain("10개 부지");
    expect(html).toContain("밭 8칸과 목장 부지 1~5");
    expect(html).toContain("재건축 비용은 닭장 500개");
    expect(html).toContain("배합 사료 5개");
    expect(html).toContain("유기질 거름 3개");
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

  it("일반 낚시와 위험 해역 실시간 조작을 구분해 안내한다", () => {
    const html = renderToStaticMarkup(<PastimesContent />);

    expect(html).toContain("일반 낚시는 기존 방식");
    expect(html).toContain("찌 던지기 → 입질 기다리기 → 챔질");
    expect(html).toContain("위험 해역 낚시");
    expect(html).toContain("Lv.15");
    expect(html).toContain("누르고 감아올리기");
    expect(html).toContain("놓아서 줄 풀기");
    expect(html).toContain("2초 동안");
    expect(html).toContain("50ms");
    expect(html).toContain("파쇄 암초");
    expect(html).toContain("폭풍 해구");
    expect(html).toContain("심연 균열");
    expect(html).toContain("표층·중층·심층");
    expect(html).toContain("어체력과 거리");
    expect(html).toContain("안전 귀환");
    expect(html).toContain("위험도 3");
    expect(html).toContain("12%");
    expect(html).toContain("위험도 5");
    expect(html).toContain("32%");
    expect(html).toContain("전용 낚싯대·릴·낚싯줄");
    expect(html).toContain("포획 확보");
    expect(html).toContain("최소 연출 시간까지 자동으로 인양");
    const retainedDurationPct =
      DANGEROUS_REALTIME_RETAINED_DURATION_PERMILLE / 10;
    expect(retainedDurationPct).toBe(65);
    expect(html).toContain(`최소 ${retainedDurationPct}%`);
    expect(html).not.toContain("어체력과 거리를 모두 0으로 만들면 포획합니다");
  });

  it("위험 해역의 레벨·장비·미끼 성장 효과를 정확히 안내한다", () => {
    const html = renderToStaticMarkup(<PastimesContent />);

    expect(html).toContain("낚시 레벨은 최대 100");
    expect(html).toContain("감기 효율 최대 12%");
    expect(html).toContain("장력 제어 최대 8%");
    expect(html).toContain("최대 +3");
    expect(html).toContain("일반 어획물 6개 + 희귀 어획물 4개 + 낚시 코인 1,000");
    expect(html).toContain("희귀 어획물 8개 + 영웅 어획물 5개 + 낚시 코인 3,000");
    expect(html).toContain("영웅 어획물 8개 + 전설 어획물 3개 + 낚시 코인 8,000");
    expect(html).toContain("낚싯대 · 레벨당 어체력 피해 +6%");
    expect(html).toContain("릴 · 레벨당 거리 회수량 +5%");
    expect(html).toContain("낚싯줄 · 레벨당 안전 구간 폭 +3%p, 화물 보호 +2%p");
    expect(html).toContain("선호 수심 100%");
    expect(html).toContain("한 단계 차이 22%");
    expect(html).toContain("두 단계 차이 5%");
    expect(html).toContain("일반·희귀 어종 출현 가중치 +25%");
    expect(html).toContain("희귀·영웅 어종 출현 가중치 +40%");
    expect(html).toContain("영웅·전설 어종 출현 가중치 +65%");
    expect(html).toContain("전설 어종 출현 가중치 +100%");
    expect(html).toContain("급선회 중 거리 회복·장력 충격 20% 감소");
    expect(html).toContain("돌진·몸부림 중 어체력 피해 20% 증가");
    expect(html).toContain("다음 행동 1개 예고·잠수 속도 15% 감소");
    expect(html).toContain("시작 어체력 10%·모든 행동 장력 충격 12% 감소");
  });

  it("현재 문서와 미끼 UI는 current engine이 실제 적용하는 카탈로그 퍼센트와 일치한다", () => {
    const html = renderToStaticMarkup(<PastimesContent />);
    const level100 = dangerousRealtimeEffectiveModifierProjection(
      dangerousRealtimeModifiers({ fishingLevel: 100, baitId: "basic_bait" }),
      DANGEROUS_REALTIME_BALANCE_REVISION,
    );
    const rodPlusOne = dangerousRealtimeEffectiveModifierProjection(
      dangerousRealtimeModifiers({
        fishingLevel: 50,
        baitId: "basic_bait",
        rodEnhancementLevel: 1,
      }),
      DANGEROUS_REALTIME_BALANCE_REVISION,
    );
    const reelPlusOne = dangerousRealtimeEffectiveModifierProjection(
      dangerousRealtimeModifiers({
        fishingLevel: 50,
        baitId: "basic_bait",
        reelEnhancementLevel: 1,
      }),
      DANGEROUS_REALTIME_BALANCE_REVISION,
    );
    const linePlusOne = dangerousRealtimeEffectiveModifierProjection(
      dangerousRealtimeModifiers({
        fishingLevel: 50,
        baitId: "basic_bait",
        lineEnhancementLevel: 1,
      }),
      DANGEROUS_REALTIME_BALANCE_REVISION,
    );

    expect(DANGEROUS_REALTIME_BALANCE_REVISION).toBe(5);
    expect(html).toContain(`감기 효율 최대 ${level100.reelEfficiencyPct}%`);
    expect(html).toContain(`장력 제어 최대 ${level100.tensionControlPct}%`);
    expect(html).toContain(
      `낚싯대 · 레벨당 어체력 피해 +${rodPlusOne.staminaDamagePct}%`,
    );
    expect(html).toContain(
      `릴 · 레벨당 거리 회수량 +${reelPlusOne.distanceRecoveryPct}%`,
    );
    expect(html).toContain(
      `낚싯줄 · 레벨당 안전 구간 폭 +${linePlusOne.safeZoneBonusPct}%p, 화물 보호 +${linePlusOne.cargoProtectionPct}%p`,
    );

    for (const baitId of [
      "reef_bait",
      "blood_bait",
      "luminous_bait",
      "abyss_bait",
    ] as const) {
      const bait = DANGEROUS_BAITS[baitId];
      const effective = dangerousRealtimeEffectiveModifierProjection(
        dangerousRealtimeModifiers({ fishingLevel: 50, baitId }),
        DANGEROUS_REALTIME_BALANCE_REVISION,
      );
      expect(effective.baitEffect).toMatchObject({
        turnDistanceRecoveryReductionPct:
          bait.realtimeEffect.turnDistanceRecoveryReductionPct,
        turnTensionImpactReductionPct:
          bait.realtimeEffect.turnTensionImpactReductionPct,
        chargeAndThrashStaminaDamagePct:
          bait.realtimeEffect.chargeAndThrashStaminaDamagePct,
        telegraphCount: bait.realtimeEffect.telegraphCount,
        diveSpeedReductionPct: bait.realtimeEffect.diveSpeedReductionPct,
        startingStaminaReductionPct:
          bait.realtimeEffect.startingStaminaReductionPct,
        tensionImpulseReductionPct:
          bait.realtimeEffect.tensionImpulseReductionPct,
      });
      const uiCopy = dangerousBaitRealtimeEffectCopy(bait);
      for (const pct of [
        effective.baitEffect.turnDistanceRecoveryReductionPct,
        effective.baitEffect.chargeAndThrashStaminaDamagePct,
        effective.baitEffect.diveSpeedReductionPct,
        effective.baitEffect.startingStaminaReductionPct,
        effective.baitEffect.tensionImpulseReductionPct,
      ].filter((value) => value > 0)) {
        expect(uiCopy).toContain(`${pct}%`);
        expect(html).toContain(`${pct}%`);
      }
    }
  });

  it("귀환 보상·판매·영구 보존과 기존 조우 호환을 안내한다", () => {
    const html = renderToStaticMarkup(<PastimesContent />);

    expect(html).toContain("남은 화물 가치 × 위험도 × 2%");
    expect(html).toContain("사고 후 남은 화물 가치");
    expect(html).toContain("화물 가치의 10배");
    expect(html).toContain("은행 예치금");
    expect(html).toContain("거래소에서도 계속 거래");
    expect(html).toContain("거대어 증표 교환 경로는 그대로");
    expect(html).toContain("일간·주간·월간 단위로 초기화되지 않습니다");
    expect(html).toContain("기존 세 가지 조작으로 완료");
    expect(html).toContain("제한 시간이 지나면 정상적으로 만료");
    expect(html).toContain("위험 해역 교환");
    expect(html).toContain("일반 어획물 4개");
    expect(html).toContain("레비아탄 낚싯대");
    expect(html).toContain("심해의 지배자");
    expect(html).toContain("서로 다른 어종을 섞어");
    expect(html).not.toContain("거래소에서 거래할 수 있지만 NPC에게 판매할 수는 없습니다");
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

  it("스킬 패턴의 독립 확률 폴백·중복 공유와 전투 프리셋 범위를 안내한다", () => {
    const html = renderToStaticMarkup(<SkillsContent />);

    expect(html).toContain("발동 확률");
    expect(html).toContain("1순위가 확률 판정에 실패하면 2순위");
    expect(html).toContain("서로 다른 스킬은 각각 독립적으로 발동 확률을 판정");
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

  it("대장장이 영구 전문화와 전문 제작의 핵심 단계를 안내한다", () => {
    const html = renderToStaticMarkup(<GuildContent />);

    expect(html).toContain("Lv.13 영구 전문 분야");
    expect(html).toContain("촉매");
    expect(html).toContain("Lv.30 최종 검수");
    expect(html).toContain("같은 총 옵션량");
    expect(html).toContain("변경하거나 초기화할 수 없습니다");
  });

  it("협회 식당의 개인 기여 식권과 무제한 주간 납품을 안내한다", () => {
    const html = renderToStaticMarkup(<GuildContent />);

    expect(html).toContain("협회 식당은 개인이 식재료");
    expect(html).toContain(">20점</strong>");
    expect(html).toContain("을 기여할 때마다 식권 1장");
    expect(html).toContain("주간 개인 납품 한도는 없습니다");
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
