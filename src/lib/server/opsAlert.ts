import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { opsSettings, users } from "@/db/schema";
import { LARGE_GOLD_MOVEMENT_LABEL } from "@/lib/server/opsEconomyThresholds";
import {
  OPS_ALERT_HISTORY_KEY,
  parseOpsAlertHistory,
  type OpsAlertHistoryEntry,
} from "@/lib/server/opsSettings";

type OpsSignalOptions = {
  key: string;
  alertType: string;
  label: string;
  threshold: number;
  windowMs: number;
  detail?: Record<string, unknown>;
};

type SignalBucket = {
  count: number;
  resetAt: number;
  alertedAt: number;
  userIds: Set<string>;
};

const signalBuckets = new Map<string, SignalBucket>();

const SAFE_WEBHOOK_STRING_KEYS = new Set([
  "alertType",
  "eventType",
  "action",
  "group",
  "scope",
  "sourceType",
  "activity",
  "riskLevel",
  "channel",
  "reason",
  "signal",
  "error",
  "itemKind",
  "itemId",
  "referenceType",
]);
const SAFE_WEBHOOK_NUMBER_KEYS = new Set([
  "count",
  "threshold",
  "windowMs",
  "accountCount",
  "userCount",
  "continuousMinutes",
  "dailyCompleted",
  "globalDailyCompleted",
  "riskScore",
  "strongSignals",
  "behaviorSignals",
  "goldDelta",
  "failed",
  "attempted",
  "abuseEvents",
  "rateLimited",
  "economyEvents",
  "goldIn",
  "goldOut",
  "rewardFailures",
  "adminActions",
  "reportId",
  "limit",
  "retryAfterSec",
  "quantity",
  "actualTradeGold",
  "actualUnitPrice",
  "referenceUnitPrice",
  "priceRatioPct",
  "referenceSampleCount",
]);
const SAFE_WEBHOOK_COUNT_LIST_KEYS = new Set([
  "topEconomyEvents",
  "topAbuseActions",
]);
const SAFE_WEBHOOK_DISPLAY_KEYS = new Set([
  "actorAccount",
  "counterpartyAccount",
  "buyerAccount",
  "sellerAccount",
]);
const SAFE_WEBHOOK_DISPLAY_LIST_KEYS = new Set(["relatedAccounts"]);
const SAFE_CODE = /^[a-zA-Z0-9._:/-]{1,160}$/;

function safeCode(value: unknown): string | null {
  return typeof value === "string" && SAFE_CODE.test(value) ? value : null;
}

function safeDisplayText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replaceAll("@", "＠")
    .replaceAll("<", "＜")
    .replaceAll(">", "＞")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, 120) : null;
}

// 외부 웹훅은 허용 목록으로 새 객체를 만든다. userId/IP/name/accounts/queueIds 등은
// 키 이름을 바꾸거나 새 호출부가 추가돼도 기본적으로 빠진다. 원본 detail 은 내부
// ops history 에만 남겨 관리자 화면에서 조사할 수 있다.
export function sanitizeOpsWebhookDetail(detail: Record<string, unknown>) {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detail)) {
    if (SAFE_WEBHOOK_STRING_KEYS.has(key)) {
      const code = safeCode(value);
      if (code !== null) sanitized[key] = code;
      continue;
    }
    if (SAFE_WEBHOOK_NUMBER_KEYS.has(key)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        sanitized[key] = value;
      }
      continue;
    }
    if (SAFE_WEBHOOK_DISPLAY_KEYS.has(key)) {
      const text = safeDisplayText(value);
      if (text !== null) sanitized[key] = text;
      continue;
    }
    if (SAFE_WEBHOOK_DISPLAY_LIST_KEYS.has(key) && Array.isArray(value)) {
      sanitized[key] = value
        .flatMap((entry) => {
          const text = safeDisplayText(entry);
          return text === null ? [] : [text];
        })
        .slice(0, 8);
      continue;
    }
    if (SAFE_WEBHOOK_COUNT_LIST_KEYS.has(key) && Array.isArray(value)) {
      sanitized[key] = value.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const record = entry as Record<string, unknown>;
        const itemKey = safeCode(record.key);
        const itemCount = record.count;
        return itemKey !== null &&
          typeof itemCount === "number" &&
          Number.isFinite(itemCount)
          ? [{ key: itemKey, count: itemCount }]
          : [];
      });
    }
  }
  return sanitized;
}

function webhookMessage(channel: string, detail: Record<string, unknown>) {
  const alertType = safeCode(detail.alertType);
  return alertCopy(alertType, channel).title;
}

type AlertCopy = {
  title: string;
  description: string;
  nextStep: string;
  color: number;
};

const CHANNEL_LABELS: Record<string, string> = {
  default: "기본 운영",
  reward: "보상",
  abuse: "이상 행동",
  economy: "게임 경제",
  deploy: "배포",
};

const ALERT_COPY: Record<string, AlertCopy> = {
  "ops.webhook_test": {
    title: "✅ 디스코드 운영 알림 연결 확인",
    description: "운영 알림 테스트 메시지입니다. 이 메시지가 보이면 웹훅 연결이 정상입니다.",
    nextStep: "별도 조치는 필요하지 않습니다.",
    color: 0x22c55e,
  },
  "ops.daily_report": {
    title: "📊 지난 24시간 운영 요약",
    description: "최근 24시간의 이상 행동, 게임 경제, 보상 실패, 관리자 작업을 모아 정리했습니다.",
    nextStep: "평소보다 크게 늘어난 항목이 있으면 관리자 > 운영 현황에서 세부 기록을 확인하세요.",
    color: 0x3b82f6,
  },
  "abuse.rate_limit_spike": {
    title: "⚠️ 요청 제한이 짧은 시간에 반복됐습니다",
    description: "특정 기능에서 너무 빠른 요청이 반복되어 서버가 요청 제한을 적용했습니다. 자동 조작뿐 아니라 연속 클릭이나 네트워크 재시도로도 발생할 수 있습니다.",
    nextStep: "관리자 > 운영 현황 > 이상 행동에서 해당 기능의 기록을 확인하세요. 이 알림만으로 이용자를 제재하지 마세요.",
    color: 0xf59e0b,
  },
  "abuse.shared_ip_candidate": {
    title: "⚠️ 한 IP에서 여러 계정 활동이 감지됐습니다",
    description: "같은 네트워크에서 여러 계정의 활동이 확인됐습니다. 가족이나 공용 네트워크일 수 있으므로 다중 계정 악용이 확정된 것은 아닙니다.",
    nextStep: "관리자 > 운영 현황 > 이상 행동에서 활동 시간과 행동 종류를 함께 확인하세요.",
    color: 0xf59e0b,
  },
  "abuse.persistent_same_ip": {
    title: "⚠️ 같은 IP의 여러 계정이 30분 이상 접속 중입니다",
    description: "같은 네트워크의 여러 계정이 장시간 동시에 접속했습니다. 가족이나 공용 네트워크일 수 있으므로 참고 신호로만 사용하세요.",
    nextStep: "관리자 > 운영 현황 > 이상 행동에서 계정별 활동 기록을 확인하세요.",
    color: 0xf59e0b,
  },
  "abuse.life_ip_fanout": {
    title: "⚠️ 한 IP에서 여러 계정의 생활 활동이 감지됐습니다",
    description: "같은 네트워크에서 여러 계정이 낚시·벌목·채광·농사를 진행해 해당 요청을 일시 제한했습니다.",
    nextStep: "관리자 > 운영 현황 > 이상 행동에서 반복 주기와 계정 수를 확인하세요.",
    color: 0xf97316,
  },
  "abuse.extreme_daily_activity": {
    title: "🚨 하루 생활 활동량이 매우 높은 계정이 감지됐습니다",
    description: "한 계정의 오늘 생활 활동 횟수가 일반적인 범위를 크게 넘었습니다. 자동 조작 여부를 확인하기 위한 경고입니다.",
    nextStep: "관리자 > 운영 현황 > 이상 행동에서 활동 시간대와 사람 확인 기록을 점검하세요.",
    color: 0xef4444,
  },
  "abuse.strong_automation_signal": {
    title: "🚨 자동 조작 의심 신호가 반복됐습니다",
    description: "생활 활동 중 정상 조작과 다른 강한 신호가 반복되어 사람 확인이 필요할 수 있습니다.",
    nextStep: "관리자 > 운영 현황 > 이상 행동에서 위험 점수와 활동 기록을 확인하세요.",
    color: 0xef4444,
  },
  "abuse.behavior_pattern": {
    title: "⚠️ 일정한 반복 조작 패턴이 감지됐습니다",
    description: "생활 활동의 입력 간격이 지나치게 일정한 패턴으로 여러 번 관찰됐습니다. 단독으로 자동 조작을 확정하는 신호는 아닙니다.",
    nextStep: "관리자 > 운영 현황 > 이상 행동에서 다른 위험 신호와 함께 확인하세요.",
    color: 0xf97316,
  },
  "economy.large_gold_movement": {
    title: "💰 큰 규모의 골드 이동이 반복됐습니다",
    description: `짧은 시간에 ${LARGE_GOLD_MOVEMENT_LABEL} 골드 이상의 이동이 여러 번 기록됐습니다. 정상 거래나 관리자 지급일 수도 있습니다.`,
    nextStep: "관리자 > 운영 현황 > 경제 기록에서 이벤트 종류와 유입·유출 흐름을 확인하세요.",
    color: 0xeab308,
  },
  "economy.marketplace_extreme_low_price": {
    title: "🚨 거래소에서 비정상적으로 싼 거래가 체결됐습니다",
    description: "동일 아이템의 최근 체결가 중앙값 또는 장비 기준가의 10% 이하에서 거래가 체결됐습니다. 단순한 저가 등록이 아니라 실제 체결 건입니다.",
    nextStep: "관리자 > 운영 현황 > 경제 기록에서 판매자·구매자와 해당 아이템의 최근 거래 내역을 확인하세요.",
    color: 0xef4444,
  },
  "reward.claim_failure": {
    title: "🎁 보상 지급 실패가 반복됐습니다",
    description: "같은 종류의 보상 지급이 짧은 시간에 여러 번 실패했습니다. 이용자가 보상을 받지 못했을 가능성이 있습니다.",
    nextStep: "관리자 > 운영 현황 > 보상 실패에서 원인을 확인하고 필요한 건을 재처리하세요.",
    color: 0xef4444,
  },
  "privacy.storage_deletion_retry_pending": {
    title: "🗑️ 탈퇴 회원 파일 일부가 삭제 대기 중입니다",
    description: "회원 탈퇴와 함께 삭제해야 할 외부 파일 중 일부가 지워지지 않아 자동 재시도 대기열에 남았습니다.",
    nextStep: "다음 정리 작업에서 자동 재시도됩니다. 같은 알림이 반복되면 서버의 파일 삭제 로그를 확인하세요.",
    color: 0xf59e0b,
  },
  "privacy.storage_deletion_queue_failed": {
    title: "🚨 탈퇴 회원 파일 삭제 작업을 실행하지 못했습니다",
    description: "외부 파일 삭제 대기열을 처리하는 과정에서 오류가 발생했습니다.",
    nextStep: "서버 로그에서 파일 저장소 연결 상태와 삭제 대기열 오류를 확인하세요.",
    color: 0xef4444,
  },
  "privacy.storage_deletion_cron_failed": {
    title: "🚨 정기 파일 삭제 재시도가 실패했습니다",
    description: "정기 정리 작업이 탈퇴 회원의 외부 파일 일부를 다시 삭제하지 못했습니다.",
    nextStep: "서버 로그에서 실패 건수와 파일 저장소 연결 상태를 확인하세요.",
    color: 0xef4444,
  },
  "ugc.report.created": {
    title: "🚩 새 사용자 콘텐츠 신고가 접수됐습니다",
    description: "이용자가 콘텐츠 또는 작성자를 신고해 운영자 확인이 필요합니다.",
    nextStep: "관리자 > 콘텐츠·사용자 신고에서 원문과 문맥을 확인하고 처리 상태를 기록하세요.",
    color: 0xf43f5e,
  },
};

function alertCopy(alertType: string | null, channel: string): AlertCopy {
  if (alertType && ALERT_COPY[alertType]) return ALERT_COPY[alertType];
  const channelLabel = CHANNEL_LABELS[channel] ?? "운영";
  return {
    title: `🔔 ${channelLabel} 알림이 도착했습니다`,
    description: "자동 감시 중 확인이 필요한 상황이 감지됐습니다.",
    nextStep: "관리자 > 운영 현황에서 같은 시간대의 세부 기록을 확인하세요.",
    color: 0x64748b,
  };
}

const DETAIL_LABELS: Record<string, string> = {
  eventType: "관련 이벤트",
  action: "관련 기능",
  group: "기능 분류",
  scope: "제한 범위",
  activity: "생활 활동",
  riskLevel: "위험 단계",
  count: "감지 횟수",
  threshold: "알림 기준",
  windowMs: "집계 시간",
  accountCount: "관련 계정 수",
  userCount: "관련 계정 수",
  continuousMinutes: "지속 시간",
  dailyCompleted: "오늘 해당 활동",
  globalDailyCompleted: "오늘 전체 생활 활동",
  riskScore: "위험 점수",
  strongSignals: "강한 의심 신호",
  behaviorSignals: "반복 패턴 신호",
  goldDelta: "골드 변동",
  failed: "실패 건수",
  attempted: "시도 건수",
  abuseEvents: "이상 행동 기록",
  rateLimited: "요청 제한 기록",
  economyEvents: "경제 기록",
  goldIn: "유입 골드",
  goldOut: "소비 골드",
  rewardFailures: "보상 실패",
  adminActions: "관리자 작업",
  topEconomyEvents: "자주 발생한 경제 이벤트",
  topAbuseActions: "자주 제한된 기능",
  sourceType: "발생 위치",
  reason: "발생 사유",
  signal: "감지 신호",
  error: "오류 코드",
  limit: "요청 허용량",
  retryAfterSec: "재시도 대기",
  quantity: "수량",
  itemKind: "아이템 분류",
  itemId: "아이템 ID",
  actualTradeGold: "실제 체결 총액",
  actualUnitPrice: "실제 개당 가격",
  referenceUnitPrice: "판정 기준 개당 가격",
  priceRatioPct: "기준가 대비",
  referenceSampleCount: "참고 거래 수",
  referenceType: "판정 기준",
  actorAccount: "발생 계정",
  counterpartyAccount: "상대 계정",
  buyerAccount: "구매 계정",
  sellerAccount: "판매 계정",
  relatedAccounts: "관련 계정",
};

const CODE_DETAIL_KEYS = new Set(["eventType", "action"]);
const FULL_WIDTH_DETAIL_KEYS = new Set([
  ...CODE_DETAIL_KEYS,
  "actorAccount",
  "counterpartyAccount",
  "buyerAccount",
  "sellerAccount",
  "relatedAccounts",
]);
const VALUE_LABELS: Record<string, string> = {
  fishing: "낚시",
  woodcutting: "벌목",
  mining: "채광",
  farming: "농사",
  marketplace: "거래소",
  shop: "상점",
  battle: "전투",
  state: "상태 동기화",
  general: "일반 기능",
  user: "계정",
  ip: "IP",
  normal: "정상",
  watch: "관찰",
  high: "높음",
  critical: "매우 높음",
  recent_median: "최근 체결가 중앙값",
  catalog_floor: "장비 NPC 판매가",
  recent_median_or_catalog: "최근 중앙값·장비 NPC 판매가 중 높은 값",
};

function formatDuration(milliseconds: number) {
  if (milliseconds >= 24 * 60 * 60_000) {
    return `${milliseconds / (24 * 60 * 60_000)}일`;
  }
  if (milliseconds >= 60 * 60_000) return `${milliseconds / (60 * 60_000)}시간`;
  if (milliseconds >= 60_000) return `${milliseconds / 60_000}분`;
  return `${Math.round(milliseconds / 1_000)}초`;
}

function formatDetailValue(key: string, value: unknown) {
  if (key === "windowMs" && typeof value === "number") return formatDuration(value);
  if (key === "continuousMinutes" && typeof value === "number") return `${value.toLocaleString("ko-KR")}분`;
  if (key === "retryAfterSec" && typeof value === "number") {
    return `${value.toLocaleString("ko-KR")}초`;
  }
  if (
    [
      "goldDelta",
      "goldIn",
      "goldOut",
      "actualTradeGold",
      "actualUnitPrice",
      "referenceUnitPrice",
    ].includes(key) &&
    typeof value === "number"
  ) {
    return `${value.toLocaleString("ko-KR")} G`;
  }
  if (key === "priceRatioPct" && typeof value === "number") {
    return `${value.toLocaleString("ko-KR")}%`;
  }
  if (typeof value === "number") return value.toLocaleString("ko-KR");
  if (typeof value === "string") {
    const translated = VALUE_LABELS[value] ?? value;
    return CODE_DETAIL_KEYS.has(key) ? `\`${translated}\`` : translated;
  }
  if (Array.isArray(value)) {
    if (SAFE_WEBHOOK_DISPLAY_LIST_KEYS.has(key)) {
      return value
        .filter((entry): entry is string => typeof entry === "string")
        .slice(0, 8)
        .map((entry) => `• ${entry}`)
        .join("\n");
    }
    return value
      .slice(0, 8)
      .map((entry) => {
        const record = entry as { key?: unknown; count?: unknown };
        const itemKey = typeof record.key === "string" ? record.key : "알 수 없음";
        const count = typeof record.count === "number" ? record.count : 0;
        return `• \`${itemKey}\` — ${count.toLocaleString("ko-KR")}회`;
      })
      .join("\n");
  }
  return String(value);
}

function discordDetailFields(detail: Record<string, unknown>) {
  return Object.entries(detail)
    .filter(([key]) => key !== "alertType" && key !== "channel" && DETAIL_LABELS[key])
    .map(([key, value]) => ({
      name: DETAIL_LABELS[key],
      value: formatDetailValue(key, value).slice(0, 1_024) || "0",
      inline:
        !SAFE_WEBHOOK_COUNT_LIST_KEYS.has(key) &&
        !FULL_WIDTH_DETAIL_KEYS.has(key),
    }))
    .slice(0, 25);
}

function isDiscordWebhook(url: string) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return (
      hostname === "discord.com" ||
      hostname.endsWith(".discord.com") ||
      hostname === "discordapp.com" ||
      hostname.endsWith(".discordapp.com")
    );
  } catch {
    return false;
  }
}

function webhookPayload(
  url: string,
  channel: string,
  detail: Record<string, unknown>,
  at: string,
) {
  const text = webhookMessage(channel, detail);
  if (!isDiscordWebhook(url)) {
    return { text, detail, at };
  }

  const alertType = safeCode(detail.alertType);
  const copy = alertCopy(alertType, channel);
  const channelLabel = CHANNEL_LABELS[channel] ?? "운영";

  return {
    content: text,
    embeds: [
      {
        description: `${copy.description}\n\n**확인할 일**\n${copy.nextStep}`,
        fields: discordDetailFields(detail),
        timestamp: at,
        color: copy.color,
        footer: {
          text: `${channelLabel} · 알림 코드: ${alertType ?? "unknown"}`,
        },
      },
    ],
    allowed_mentions: { parse: [] },
  };
}

export async function sendOpsAlert(
  message: string,
  detail?: Record<string, unknown>,
) {
  const channel = selectOpsAlertChannel(detail);
  const url = channel.url;
  const recordedDetail = { ...(detail ?? {}), channel: channel.key };
  const webhookDetail = sanitizeOpsWebhookDetail({
    ...recordedDetail,
    ...(await resolveWebhookIdentities(recordedDetail)),
  });
  if (!url) {
    await recordOpsAlertHistory({
      message,
      detail: recordedDetail,
      status: "skipped",
      error: `${channel.envName} not configured`,
    });
    return;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        webhookPayload(
          url,
          channel.key,
          webhookDetail,
          new Date().toISOString(),
        ),
      ),
    });
    if (!response.ok) {
      throw new Error(`webhook responded with HTTP ${response.status}`);
    }
    await recordOpsAlertHistory({
      message,
      detail: recordedDetail,
      status: "sent",
      error: null,
    });
  } catch (e) {
    console.error("[ops-alert] webhook failed", e);
    await recordOpsAlertHistory({
      message,
      detail: recordedDetail,
      status: "failed",
      error: e instanceof Error ? e.message : "unknown error",
    });
  }
}

export function recordOpsSignal({
  key,
  alertType,
  label,
  threshold,
  windowMs,
  detail,
}: OpsSignalOptions) {
  const now = Date.now();
  const current = signalBuckets.get(key);
  const bucket =
    current && current.resetAt > now
      ? current
      : {
          count: 0,
          resetAt: now + windowMs,
          alertedAt: 0,
          userIds: new Set<string>(),
        };

  bucket.count += 1;
  for (const userId of userIdsFromDetail(detail)) bucket.userIds.add(userId);
  signalBuckets.set(key, bucket);

  if (bucket.count < threshold || bucket.alertedAt > 0) return;
  bucket.alertedAt = now;
  void sendOpsAlert(`[ops] ${label}`, {
    ...detail,
    relatedUserIds: [...bucket.userIds].slice(0, 8),
    alertType,
    signalKey: key,
    count: bucket.count,
    threshold,
    windowMs,
  });
}

function shortUserId(userId: string): string {
  return userId.length > 12 ? `${userId.slice(0, 8)}…` : userId;
}

function validUserId(value: unknown): string | null {
  return safeCode(value);
}

function userIdsFromDetail(detail?: Record<string, unknown>): string[] {
  if (!detail) return [];
  const ids = new Set<string>();
  for (const key of [
    "userId",
    "counterpartyUserId",
    "buyerUserId",
    "sellerUserId",
  ]) {
    const userId = validUserId(detail[key]);
    if (userId) ids.add(userId);
  }
  for (const key of ["sampleUserIds", "relatedUserIds"]) {
    const values = detail[key];
    if (!Array.isArray(values)) continue;
    for (const value of values) {
      const userId = validUserId(value);
      if (userId) ids.add(userId);
    }
  }
  const accounts = detail.accounts;
  if (Array.isArray(accounts)) {
    for (const account of accounts) {
      if (!account || typeof account !== "object") continue;
      const userId = validUserId((account as Record<string, unknown>).userId);
      if (userId) ids.add(userId);
    }
  }
  return [...ids].slice(0, 16);
}

async function resolveWebhookIdentities(detail: Record<string, unknown>) {
  const userIds = userIdsFromDetail(detail);
  if (userIds.length === 0) return {};

  const nameByUserId = new Map<string, string>();
  if (Array.isArray(detail.accounts)) {
    for (const account of detail.accounts) {
      if (!account || typeof account !== "object") continue;
      const record = account as Record<string, unknown>;
      const userId = validUserId(record.userId);
      const name = safeDisplayText(record.name);
      if (userId && name) nameByUserId.set(userId, name);
    }
  }
  if (process.env.DATABASE_URL) {
    try {
      const rows = await db
        .select({ id: users.id, gameName: users.gameName })
        .from(users)
        .where(inArray(users.id, userIds));
      for (const row of rows) {
        const name = safeDisplayText(row.gameName);
        if (name) nameByUserId.set(row.id, name);
      }
    } catch (e) {
      console.error("[ops-alert] account identity lookup failed", e);
    }
  }

  const identityLabel = (userId: string) => {
    const shortId = shortUserId(userId);
    const name = nameByUserId.get(userId);
    return name ? `${name} · ${shortId}` : shortId;
  };
  const actorId = validUserId(detail.userId);
  const counterpartyId = validUserId(detail.counterpartyUserId);
  const buyerId = validUserId(detail.buyerUserId);
  const sellerId = validUserId(detail.sellerUserId);
  const relatedIds = new Set<string>();
  for (const key of ["sampleUserIds", "relatedUserIds"]) {
    const values = detail[key];
    if (!Array.isArray(values)) continue;
    for (const value of values) {
      const userId = validUserId(value);
      if (userId) relatedIds.add(userId);
    }
  }
  if (Array.isArray(detail.accounts)) {
    for (const account of detail.accounts) {
      if (!account || typeof account !== "object") continue;
      const userId = validUserId((account as Record<string, unknown>).userId);
      if (userId) relatedIds.add(userId);
    }
  }
  for (const directId of [actorId, counterpartyId, buyerId, sellerId]) {
    if (directId) relatedIds.delete(directId);
  }

  return {
    ...(actorId ? { actorAccount: identityLabel(actorId) } : {}),
    ...(counterpartyId
      ? { counterpartyAccount: identityLabel(counterpartyId) }
      : {}),
    ...(buyerId ? { buyerAccount: identityLabel(buyerId) } : {}),
    ...(sellerId ? { sellerAccount: identityLabel(sellerId) } : {}),
    ...(relatedIds.size > 0
      ? { relatedAccounts: [...relatedIds].slice(0, 8).map(identityLabel) }
      : {}),
  };
}

export function resetOpsAlertsForTests() {
  signalBuckets.clear();
}

async function recordOpsAlertHistory(entry: Omit<OpsAlertHistoryEntry, "id" | "createdAt">) {
  if (!process.env.DATABASE_URL) return;
  try {
    const now = new Date();
    const current = (
      await db
        .select({ value: opsSettings.value })
        .from(opsSettings)
        .where(eq(opsSettings.key, OPS_ALERT_HISTORY_KEY))
        .limit(1)
    )[0];
    const entries = parseOpsAlertHistory(current?.value);
    const next: OpsAlertHistoryEntry[] = [
      {
        id: `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        message: entry.message.slice(0, 300),
        detail: entry.detail,
        status: entry.status,
        error: entry.error ? entry.error.slice(0, 300) : null,
        createdAt: now.toISOString(),
      },
      ...entries,
    ].slice(0, 100);
    await db
      .insert(opsSettings)
      .values({
        key: OPS_ALERT_HISTORY_KEY,
        value: next,
        updatedByEmail: "system",
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: opsSettings.key,
        set: { value: next, updatedByEmail: "system", updatedAt: now },
      });
  } catch (e) {
    console.error("[ops-alert] history failed", e);
  }
}

function selectOpsAlertChannel(detail?: Record<string, unknown>) {
  const requestedChannel = typeof detail?.channel === "string" ? detail.channel : "";
  if (requestedChannel === "reward") {
    return webhookChannel(
      "reward",
      "OPS_ALERT_REWARD_WEBHOOK_URL",
      process.env.OPS_ALERT_REWARD_WEBHOOK_URL,
    );
  }
  if (requestedChannel === "abuse") {
    return webhookChannel(
      "abuse",
      "OPS_ALERT_ABUSE_WEBHOOK_URL",
      process.env.OPS_ALERT_ABUSE_WEBHOOK_URL,
    );
  }
  if (requestedChannel === "economy") {
    return webhookChannel(
      "economy",
      "OPS_ALERT_ECONOMY_WEBHOOK_URL",
      process.env.OPS_ALERT_ECONOMY_WEBHOOK_URL,
    );
  }
  if (requestedChannel === "deploy") {
    return webhookChannel(
      "deploy",
      "OPS_ALERT_DEPLOY_WEBHOOK_URL",
      process.env.OPS_ALERT_DEPLOY_WEBHOOK_URL,
    );
  }
  if (requestedChannel === "default") {
    return webhookChannel("default", "OPS_ALERT_WEBHOOK_URL", process.env.OPS_ALERT_WEBHOOK_URL);
  }
  const signalKey = typeof detail?.signalKey === "string" ? detail.signalKey : "";
  const eventType = typeof detail?.eventType === "string" ? detail.eventType : "";
  if (signalKey.includes("reward") || eventType.startsWith("reward.failure.")) {
    return webhookChannel(
      "reward",
      "OPS_ALERT_REWARD_WEBHOOK_URL",
      process.env.OPS_ALERT_REWARD_WEBHOOK_URL,
    );
  }
  if (
    signalKey.includes("abuse") ||
    signalKey.includes("rate-limit") ||
    signalKey.includes("same-ip")
  ) {
    return webhookChannel(
      "abuse",
      "OPS_ALERT_ABUSE_WEBHOOK_URL",
      process.env.OPS_ALERT_ABUSE_WEBHOOK_URL,
    );
  }
  if (signalKey.includes("economy") || eventType.startsWith("admin.reward.")) {
    return webhookChannel(
      "economy",
      "OPS_ALERT_ECONOMY_WEBHOOK_URL",
      process.env.OPS_ALERT_ECONOMY_WEBHOOK_URL,
    );
  }
  return webhookChannel("default", "OPS_ALERT_WEBHOOK_URL", process.env.OPS_ALERT_WEBHOOK_URL);
}

function webhookChannel(key: string, envName: string, url: string | undefined) {
  return {
    key,
    envName,
    url: url || process.env.OPS_ALERT_WEBHOOK_URL,
  };
}
