type RewardFailureRow = {
  id: number;
  userId: string | null;
  eventType: string;
  itemId: string | null;
  detail: unknown;
};

type EconomyRow = {
  userId: string | null;
  eventType: string;
  itemKind: string | null;
  itemId: string | null;
  quantity: number | null;
  detail: unknown;
};

export function classifyRewardFailure(
  row: RewardFailureRow,
  currentDayEconomyRows: EconomyRow[],
) {
  const detail = detailObject(row.detail);
  const haystack = `${row.eventType} ${row.itemId ?? ""} ${JSON.stringify(detail)}`.toLowerCase();
  const compensated = currentDayEconomyRows.find((event) => {
    if (event.eventType !== "admin.reward.compensate") return false;
    if (event.userId && row.userId && event.userId !== row.userId) return false;
    const eventDetail = detailObject(event.detail);
    return Number(eventDetail.sourceEventId ?? 0) === row.id;
  });
  if (compensated) {
    return {
      key: "already_compensated",
      label: "이미 보정 가능성",
      tone: "warning" as const,
      priority: 20,
      action: "처리 상태를 보정 완료로 맞출지 확인",
    };
  }
  if (haystack.includes("weekly_source_conflict")) {
    return {
      key: "policy_rejection",
      label: "정상 정책 차단",
      tone: "info" as const,
      priority: 10,
      action: "보정하지 않고 제외 처리",
    };
  }
  if (
    haystack.includes("daily_cap") ||
    haystack.includes("dailycap") ||
    haystack.includes("daily cap") ||
    haystack.includes("limit") ||
    haystack.includes("cap")
  ) {
    return {
      key: "daily_cap",
      label: "일일 제한 가능성",
      tone: "info" as const,
      priority: 40,
      action: "유저 운영 요약의 오늘 낚시 코인 상한 확인",
    };
  }
  if (
    haystack.includes("duplicate") ||
    haystack.includes("already") ||
    haystack.includes("claimed") ||
    haystack.includes("중복") ||
    haystack.includes("이미")
  ) {
    return {
      key: "duplicate_or_claimed",
      label: "중복 수령 가능성",
      tone: "warning" as const,
      priority: 50,
      action: "최근 보상 수령과 원본 event id 확인",
    };
  }
  return {
    key: "possible_missing",
    label: "미지급 가능성",
    tone: "danger" as const,
    priority: 80,
    action: "유저 보정 화면에서 원본 event id로 보정 검토",
  };
}

function detailObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}
