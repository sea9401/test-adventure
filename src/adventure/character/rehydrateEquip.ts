// 저장된 EquippedItem 을 "지금" 데이터 정의로 재계산.
//
// 직렬화된 saved 인스턴스는 저장 시점의 stats/bonus 를 통째로 들고 있어, 밸런스 패치
// (예: 부적 행운 +3 → +2, 제작 variance 조정) 후에도 그대로 옛 수치로 보인다.
// 그래서 슬롯에서 꺼낼 때마다 (itemId, craftTier 또는 dropQuality) 로 다시 계산해 최신
// 정의의 stats/bonus 를 반영한다. 이름 매칭이 안 되면(아이템 삭제·rename) null —
// 슬롯에서 사라짐.
//
// ⚠️ 라이브(useCharacterState)·서버측 autoHunt/derivePlayerCombatFromSaves 모두 이
// 헬퍼를 공유해야 한다. 과거엔 두 서버 파일이 craftTier/dropQuality 를 무시하고 베이스
// 아이템만 돌려줘서, 걸작/빼어난 장비를 낀 유저의 서버측 스탯이 ±2~6 깎였고, feat
// 임계치 바로 위에 있던 빌드는 흡혈/곡예/천칭 같은 특기가 위탁 사냥에서 조용히 비활성화됐다.

import { ITEMS, findItemId } from "@/adventure/data/items";
import { resolveCraftedItem } from "@/adventure/data/recipes";
import { resolveDroppedItem } from "@/adventure/data/dropQuality";
import { ENHANCE_MAX_LEVEL, isEnhanceable, resolveEnhancedItem } from "./enhancement";
import type { EquippedItem } from "./types";

export function rehydrateEquippedItem(
  saved: EquippedItem | null | undefined,
): EquippedItem | null {
  if (!saved) return null;
  const id = findItemId(saved);
  if (!id) return null;
  // 인스턴스 기반(강화 가능 장비). instanceId 가 박혀 있어야 정상.
  if (isEnhanceable(id)) {
    if (typeof saved.instanceId === "string" && saved.instanceId) {
      const rawLv = saved.enhancementLevel ?? 0;
      const lv = Math.max(0, Math.min(ENHANCE_MAX_LEVEL, Math.floor(rawLv)));
      const historyOrLv = saved.enhanceHistory ?? lv;
      return resolveEnhancedItem(
        id,
        saved.craftTier,
        historyOrLv,
        saved.instanceId,
        saved.enchantSlots,
        saved.remainingAttempts,
      );
    }
    // instanceId 누락 (마이그레이션 도중 / 인스턴스 풀 sync 누락) — 슬롯에서 사라지면
    // 데이터 손실이라, 강화 0 단계의 베이스/craftTier 아이템으로 살린다. 강화 시도 시
    // 서버가 instance 없음을 거부할 텐데, 그땐 슬롯 해제 후 다시 장착하면 된다.
    const tier = saved.craftTier;
    if (tier != null && tier !== 0) return resolveCraftedItem(id, tier);
    return ITEMS[id];
  }
  const tier = saved.craftTier;
  if (tier != null && tier !== 0) return resolveCraftedItem(id, tier);
  const q = saved.dropQuality;
  if (q === 1 || q === 2) return resolveDroppedItem(id, q);
  return ITEMS[id];
}
