// v2 모험의 서(재료 도감) 진척 — 전직 게이트 + 코덱스 UI 가 공용으로 쓰는 순수 모듈.
//
// "도감 진척" = character.v2.materials 에 실제로 수집한(>0) 서로 다른 재료 종 수.
// 3·4차 전직이 이 진척을 요건으로 건다(설계: 직업 해금을 모험의 서 진척에 묶는다).
// 클라(프리뷰)·서버(권위) 공용 — 서버가 최종 판정.

import { V2_MATERIALS, V2_MATERIALS_ENABLED, type V2MaterialId } from "./dungeonDrops";

// 코덱스 총 등재 가능 재료 수(= 알려진 재료 종). 재료가 늘면 자동으로 커진다.
export const V2_CODEX_TOTAL = (Object.keys(V2_MATERIALS) as V2MaterialId[]).length;

// character.v2.materials(Record<id, count>) 에서 수집한(유효 id + count>0) 재료 id 들.
// 손상된 입력(객체 아님 등)은 빈 배열. 알려지지 않은 id 는 무시.
export function discoveredMaterialIds(raw: unknown): V2MaterialId[] {
  if (!raw || typeof raw !== "object") return [];
  const map = raw as Record<string, unknown>;
  return (Object.keys(V2_MATERIALS) as V2MaterialId[]).filter((id) => {
    const v = map[id];
    return typeof v === "number" && Number.isFinite(v) && v > 0;
  });
}

export function countDiscoveredMaterials(raw: unknown): number {
  return discoveredMaterialIds(raw).length;
}

// 목표 직업의 도감 요건 — advanceCodexMin 을 코덱스 총량으로 클램프(총량보다 클 수 없음).
// 미지정/0 이면 요건 없음(0).
export function codexRequirement(advanceCodexMin: number | undefined): number {
  // 재료 보류 중 — 전직 재료 요건 해제(레벨/숙련도로만 전직). 클라 프리뷰·서버 권위 공용.
  if (!V2_MATERIALS_ENABLED) return 0;
  if (!advanceCodexMin || advanceCodexMin <= 0) return 0;
  return Math.min(advanceCodexMin, V2_CODEX_TOTAL);
}
