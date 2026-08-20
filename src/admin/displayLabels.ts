import { jobDisplayName, parseV2Class } from "@/adventure/data/v2/classes";
import { V2_SKILLS } from "@/adventure/data/v2/v2Skills";
import {
  economyDetailKeyLabel,
  economyEventLabel,
  economyItemKindLabel,
  economyKnownItemName,
} from "./economyLabels";

export const ADMIN_ACTION_LABELS: Record<string, string> = {
  "character.preview": "캐릭터 체험",
  "codex-research.award-trophies": "도감 연구 트로피 발급",
  "codex-research.invalid": "도감 연구 잘못된 운영 요청",
  "codex-research.preview-settlement": "도감 연구 결산 미리보기",
  "codex-research.resettle": "도감 연구 재결산",
  "codex-research.schedule": "도감 연구 시즌 예약",
  "codex-research.settle": "도감 연구 결산",
  "codex-research.validate": "도감 연구 정의 검증",
  "impersonation.end": "계정 가장 종료",
  "impersonation.start": "계정 가장 시작",
  "grant.v2": "아이템 지급",
  "guild-cooldown.clear": "길드 쿨다운 해제",
  "mail.broadcast": "전체 우편",
  "mail.user": "개별 우편",
  "mastery-tower.reset-daily": "숙련의 탑 일일 초기화",
  "ops-alert.test": "운영 알림 테스트",
  "ops-settings.alert-thresholds.update": "운영 알림 기준 변경",
  "ops-settings.hot-time-schedules.update": "핫타임 반복 일정 변경",
  "ops-settings.hot-time.update": "핫타임 설정 변경",
  "ops-settings.ops-note-templates.update": "운영 메모 템플릿 변경",
  "ops-settings.reward-compensation-presets.update": "보상 보정 프리셋 변경",
  "ops-user-notes.add": "운영 메모 추가",
  "ops-user-notes.delete": "운영 메모 삭제",
  "ops-user-notes.reopen": "운영 메모 재오픈",
  "ops-user-notes.resolve": "운영 메모 처리",
  "reset-character": "캐릭터 초기화",
  "reward.compensate": "보상 보정",
  "reward-failure.compensated.bulk": "보상 실패 보정 완료 처리",
  "reward-failure.ignored.bulk": "보상 실패 제외 처리",
  "reward-failure.reviewed.bulk": "보상 실패 검토 완료 처리",
  "sanction.ban": "영구 밴",
  "sanction.extend": "제재 기간 연장",
  "sanction.lift": "제재 해제",
  "sanction.suspend": "기간 정지",
  "sanction.trade_ban": "거래 영구 정지",
  "sanction.trade_extend": "거래 정지 기간 연장",
  "sanction.trade_lift": "거래 제재 해제",
  "sanction.trade_suspend": "거래 기간 정지",
  "sanction.warn": "경고",
  "saves.patch": "세이브 수정",
  "season-ops.fishing-rewards": "낚시 보상 지급",
  "season-ops.pvp-rewards": "아레나 보상 지급",
  "season-ops.pvp-rollover": "아레나 시즌 정리",
  "season-ops.war-rollover": "전쟁 시즌 정리",
  "storm-expedition.reset-daily-attempts": "폭풍 원정 일일 횟수 초기화",
  "suspicion-score.reset": "매크로 의심 점수 초기화",
};

export const ABUSE_ACTION_LABELS: Record<string, string> = {
  "presence:heartbeat": "접속 상태 확인",
  cast: "낚시 던지기",
  enhance: "장비 강화",
  hunt: "사냥",
  spam: "반복 요청",
  "v2:coop:attack": "협동 보스 공격",
  "v2:dungeon:hunt": "던전 사냥",
  "v2:fishing:cast": "낚시 던지기",
  "v2:fishing:reel": "낚시 감아올리기",
  "v2:fishing:activity-guard": "낚시 자동화 방어",
  "v2:woodcutting:activity-guard": "벌목 자동화 방어",
  "v2:mining:activity-guard": "채광 자동화 방어",
  "v2:farming:activity-guard": "농장 자동화 방어",
  "v2:fishing:human-check": "낚시 사람 확인",
  "v2:woodcutting:human-check": "벌목 사람 확인",
  "v2:mining:human-check": "채광 사람 확인",
  "v2:farming:human-check": "농장 사람 확인",
  "v2:farming:mutation": "농장 활동",
  "v2:guild:combat-supply:upgrade": "길드 전투 보급 강화",
  "v2:guild:training-ground:claim": "길드 훈련장 수령",
  "v2:marketplace:browse": "거래소 둘러보기",
  "v2:marketplace:buy": "거래소 구매",
  "v2:marketplace:cancel": "거래소 취소",
  "v2:marketplace:history": "거래소 내역 조회",
  "v2:marketplace:list": "거래소 등록",
  "v2:marketplace:prices": "거래소 시세 조회",
  "v2:mastery-tower:attempt": "숙련의 탑 도전",
  "v2:mastery-tower:claim": "숙련의 탑 보상 수령",
  "v2:me:enhance": "장비 강화",
  "v2:me:state": "캐릭터 상태 조회",
  "v2:me:use-coop-equipment-box": "협동 장비 상자 사용",
  "v2:me:use-coop-mastery-tome": "협동 숙련서 사용",
  "v2:me:use-exp-tome": "경험치 책 사용",
  "v2:me:use-sp-fruit": "SP 열매 사용",
  "v2:me:use-stamina-potion": "스태미나 회복약 사용",
  "v2:secret-shop:buy": "비밀 상점 구매",
  "v2:secret-shop:delete": "비밀 상점 삭제",
  "v2:shop:charge": "충전약 상점",
  "v2:shop:equipment": "장비 상점 구매",
  "v2:shop:equipment:sell": "장비 판매",
  "v2:shop:equipment:sell-bulk": "장비 일괄 판매",
  "v2:shop:material:sell": "재료 판매",
};

export const ABUSE_REASON_LABELS: Record<string, string> = {
  rate_limited: "요청 제한",
  extreme_daily_activity: "비정상적인 일일 활동량",
  fishing_macro_pattern: "낚시 매크로 패턴",
  human_verification_failed: "사람 확인 실패",
  human_verification_required: "사람 확인 요구",
  human_verification_succeeded: "사람 확인 성공",
  activity_behavior_pattern: "규칙적인 자동화 의심 패턴",
  multi_account_ip_fanout: "동일 IP 다계정 활동",
  persistent_same_ip_accounts: "동일 IP 장시간 다계정 접속",
  strong_activity_signal: "반복 자동화 강신호",
};

const LOG_LABELS: Record<string, string> = {
  abuse: "이상 행동",
  audit: "감사",
  economy: "경제",
};

const DETAIL_KEY_LABELS: Record<string, string> = {
  accountCount: "계정 수",
  accounts: "계정 목록",
  activePreserved: "진행 중 원정 유지",
  action: "행동",
  adminMemo: "관리자 메모",
  amount: "수량",
  balance: "이후 잔액",
  beforeBalance: "이전 잔액",
  buyOrdersCancelled: "취소 구매 주문 수",
  classId: "직업",
  count: "개수",
  continuousMinutes: "지속 시간(분)",
  changed: "변경 여부",
  date: "기준일",
  days: "일수",
  error: "오류",
  eventId: "이벤트 ID",
  eventIds: "이벤트 ID",
  eventType: "이벤트",
  gameName: "캐릭터명",
  gold: "골드",
  hpCharges: "HP 충전약",
  highestBidsCleared: "해제 최고 입찰 수",
  itemId: "아이템",
  itemKind: "아이템 종류",
  materialId: "재료",
  message: "메시지",
  listingsCancelled: "취소 매물 수",
  mpCharges: "MP 충전약",
  path: "경로",
  previousAttemptsUsed: "이전 입장 사용 횟수",
  quantity: "수량",
  reason: "사유",
  recipients: "수신자",
  refundedGold: "반환 골드",
  source: "출처",
  sourceEventId: "원본 이벤트",
  specChoice: "전문화",
  staminaPotions: "스태미나 회복약",
  status: "상태",
  target: "대상",
  userId: "유저 ID",
};

export function adminActionLabel(action: string): string {
  return ADMIN_ACTION_LABELS[action] ?? action;
}

export function resolveAdminActionFilter(raw: string): string {
  return resolveLabelFilter(raw, ADMIN_ACTION_LABELS);
}

export function abuseActionLabel(action: string): string {
  return ABUSE_ACTION_LABELS[action] ?? action;
}

export function resolveAbuseActionFilter(raw: string): string {
  return resolveLabelFilter(raw, ABUSE_ACTION_LABELS);
}

export function abuseReasonLabel(reason: string): string {
  return ABUSE_REASON_LABELS[reason] ?? reason;
}

export function resolveAbuseReasonFilter(raw: string): string {
  return resolveLabelFilter(raw, ABUSE_REASON_LABELS);
}

export function adminLogLabel(log: string): string {
  return LOG_LABELS[log] ?? log;
}

export function adminDetailKeyLabel(key: string): string {
  return DETAIL_KEY_LABELS[key] ?? economyDetailKeyLabel(key);
}

export function adminDetailValueLabel(key: string, value: unknown): string {
  if (typeof value === "string") {
    if (key === "action") {
      return ABUSE_ACTION_LABELS[value] ?? ADMIN_ACTION_LABELS[value] ?? value;
    }
    if (key === "eventType") return economyEventLabel(value);
    if (key === "itemKind") return economyItemKindLabel(value);
    if (key === "materialId" || key === "itemId" || key === "equipmentId") {
      return economyKnownItemName(value);
    }
    if (key === "reason") return abuseReasonLabel(value);
    if (key === "classId") return jobDisplayName(parseV2Class(value), null);
    if (key === "skillId") return V2_SKILLS[value as keyof typeof V2_SKILLS]?.name ?? value;
    if (key === "status") return adminStatusLabel(value);
    if (key === "target") return value === "all" ? "전체 유저" : value === "user" ? "특정 유저" : value;
    return value;
  }
  if (typeof value === "number") return value.toLocaleString();
  if (typeof value === "boolean") return value ? "예" : "아니오";
  if (Array.isArray(value)) {
    return value.map((v) => adminDetailValueLabel(key, v)).join(", ");
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${adminDetailKeyLabel(k)}: ${adminDetailValueLabel(k, v)}`)
      .join(", ");
  }
  return "-";
}

export function adminDetailText(detail: Record<string, unknown> | null): string {
  if (!detail) return "-";
  const entries = Object.entries(detail);
  if (entries.length === 0) return "-";
  return entries
    .map(([key, value]) => `${adminDetailKeyLabel(key)}: ${adminDetailValueLabel(key, value)}`)
    .join(" · ");
}

export function adminStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    compensated: "보정 완료",
    failed: "실패",
    ignored: "제외",
    open: "후보",
    reviewed: "검토 완료",
    sent: "성공",
    skipped: "스킵",
  };
  return labels[status] ?? status;
}

export function skillLabel(skillId: string): string {
  return V2_SKILLS[skillId as keyof typeof V2_SKILLS]?.name ?? skillId;
}

export function jobLabel(classId: string | null, specChoice: string | null): string {
  return jobDisplayName(parseV2Class(classId), specChoice);
}

function resolveLabelFilter(raw: string, labels: Record<string, string>): string {
  const value = raw.trim();
  if (!value) return "";
  const found = Object.entries(labels).find(
    ([key, label]) => key === value || label === value,
  );
  return found?.[0] ?? value;
}
