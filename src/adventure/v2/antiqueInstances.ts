// 인스턴스 기반 골동품 — 한 점 한 점 고유 ID + 보존상태. 같은 종류라도 보존상태가
// 달라 거래소에서 가격이 갈린다(EquipmentInstance 인스턴스 거래 모델 미러).
//
// 설계: docs/treasure-hunt-plan.md §3
// 발굴(PR-3)에서 서버가 instanceId·condition 을 발급한다. 클라가 발급할 일은 없지만
// 헬퍼는 둔다. 저장된 raw 는 normalize 가 위조 가드와 함께 정규화.

import {
  isAntiqueId,
  MIN_CONDITION,
  type AntiqueId,
} from "@/adventure/data/v2/antique";

export type AntiqueInstance = {
  /** 고유 ID. crypto.randomUUID 권장 (서버에서 생성). 절대 재사용 X. */
  instanceId: string;
  /** 골동품 종류. 카탈로그(ANTIQUES)가 권위 — 알 수 없는 id 는 drop. */
  antiqueId: AntiqueId;
  /** 보존상태 5~100 정수. */
  condition: number;
  /** 발굴 시각. */
  foundAt: number;
};

// 인스턴스 ID 생성 — 서버/클라 모두 randomUUID 가 있으면 그걸, 없으면 fallback.
export function generateAntiqueInstanceId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `antq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// 저장된 raw 값을 AntiqueInstance 로 정규화. 잘못된 entry 는 drop.
// 위조 가드: instanceId 비어있지 않은 문자열 + antiqueId 카탈로그 안 + condition 정수 범위.
export function normalizeAntiqueInstance(raw: unknown): AntiqueInstance | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<AntiqueInstance>;
  if (typeof r.instanceId !== "string" || !r.instanceId.trim()) return null;
  if (typeof r.antiqueId !== "string" || !isAntiqueId(r.antiqueId)) return null;
  const cond = r.condition;
  if (
    typeof cond !== "number" ||
    !Number.isInteger(cond) ||
    cond < MIN_CONDITION ||
    cond > 100
  ) {
    return null;
  }
  const foundAt =
    typeof r.foundAt === "number" && Number.isFinite(r.foundAt) ? r.foundAt : 0;
  return {
    instanceId: r.instanceId,
    antiqueId: r.antiqueId,
    condition: cond,
    foundAt,
  };
}

export function normalizeAntiqueInstances(raw: unknown): AntiqueInstance[] {
  if (!Array.isArray(raw)) return [];
  const out: AntiqueInstance[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const n = normalizeAntiqueInstance(r);
    if (n && !seen.has(n.instanceId)) {
      out.push(n);
      seen.add(n.instanceId);
    }
  }
  return out;
}
