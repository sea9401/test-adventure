import {
  PREMIUM_ADVENTURE_SUPPORT_PASS,
  adventureSupportBenefits,
  type AdventureSupportTier,
} from "@/adventure/data/v2/adventureSupport";
import { MASTERY_TOWER_DAILY_ENTRY_STAMINA_COST } from "@/adventure/data/v2/masteryTower";
import { MAX_STAMINA } from "@/adventure/v2/stamina";

const MINUTE_MS = 60 * 1_000;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

export type AdventureSupportRemaining = {
  days: number;
  hours: number;
  minutes: number;
  expired: boolean;
};

export function adventureSupportRemaining(
  activeUntil: number,
  now: number,
): AdventureSupportRemaining {
  const totalMinutes =
    Number.isFinite(activeUntil) && Number.isFinite(now)
      ? Math.max(0, Math.ceil((activeUntil - now) / MINUTE_MS))
      : 0;
  const days = Math.floor(totalMinutes / MINUTES_PER_DAY);
  const hours = Math.floor(
    (totalMinutes % MINUTES_PER_DAY) / MINUTES_PER_HOUR,
  );
  const minutes = totalMinutes % MINUTES_PER_HOUR;
  return { days, hours, minutes, expired: totalMinutes <= 0 };
}

export function formatAdventureSupportRemaining(
  activeUntil: number,
  now: number,
): string {
  const remaining = adventureSupportRemaining(activeUntil, now);
  if (remaining.expired) return "만료됨";
  return `${remaining.days}일 ${remaining.hours}시간 ${remaining.minutes}분 남음`;
}

export function formatAdventureSupportExpiry(activeUntil: number): string {
  if (!Number.isFinite(activeUntil) || activeUntil <= 0) return "만료 일시 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(activeUntil));
}

export function queuedStandardSupportMs(
  activeUntil: number,
  premiumUntil: number,
  now: number,
): number {
  if (
    !Number.isFinite(activeUntil) ||
    !Number.isFinite(premiumUntil) ||
    !Number.isFinite(now) ||
    premiumUntil <= now ||
    activeUntil <= premiumUntil
  ) {
    return 0;
  }
  return activeUntil - premiumUntil;
}

// 지원권 사용 직후 알림. 프리미엄은 함께 받는 연장권이 가방에 보이지 않으므로 사용 위치까지 알리고,
// 프리미엄 이용 중에 쓴 일반 지원권은 바로 적용되지 않고 뒤에 이어진다는 점을 알린다.
export function adventureSupportUseNotice(input: {
  premiumItem: boolean;
  daysAdded: number;
  tier: AdventureSupportTier;
}): string {
  if (input.premiumItem) {
    return `월간 모험 지원권 프리미엄 ${input.daysAdded}일 적용 · 꾸미기 30일 연장권 ${PREMIUM_ADVENTURE_SUPPORT_PASS.cosmeticExtensionGrant}개 지급 (설정 메뉴의 꾸미기에서 사용)`;
  }
  if (input.tier === "premium") {
    return `월간 모험 지원권 ${input.daysAdded}일 추가 · 프리미엄 종료 뒤부터 이어집니다`;
  }
  return `월간 모험 지원권 ${input.daysAdded}일 적용`;
}

export function autoGatheringReservationBenefitLabel(count: number): string {
  return `자동 채집 다음 작업 예약 ${count}건`;
}

export const MASTERY_TOWER_ENTRY_FREE_LABEL = `숙련의 탑 입장 스태미나 ${MASTERY_TOWER_DAILY_ENTRY_STAMINA_COST} 면제 (하루 한 번 내는 비용)`;

// 캐릭터 카드의 "혜택 적용 중" 목록. 등급별 수치를 그대로 읽어 온다.
export function adventureSupportBenefitLines(
  tier: AdventureSupportTier,
): string[] {
  const benefits = adventureSupportBenefits(tier);
  return [
    `에너지 회복량 ${benefits.staminaRegenBonusPct}% 증가`,
    `최대 에너지 ${benefits.staminaMaxBonus.toLocaleString()} 증가 (기본 ${MAX_STAMINA.toLocaleString()} → ${(MAX_STAMINA + benefits.staminaMaxBonus).toLocaleString()})`,
    `일괄 전투 최대 ${benefits.maxHuntBatch}회`,
    ...(benefits.autoGatheringReservations > 0
      ? [autoGatheringReservationBenefitLabel(benefits.autoGatheringReservations)]
      : []),
    `거래소 등록 ${benefits.marketplaceSlotBonus}개 추가`,
    `거래소 수수료 ${benefits.marketplaceTaxRate * 100}%로 감소`,
    ...(benefits.masteryTowerEntryFree ? [MASTERY_TOWER_ENTRY_FREE_LABEL] : []),
  ];
}
