// 지급/우편 첨부 드롭다운의 카탈로그 옵션 — BroadcastTab·V2GrantSection 공용
// (그동안 두 탭이 같은 useMemo 빌더를 각자 복붙). label = 드롭다운 표기, name = chip 표기.
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";
import { V2_MATERIALS } from "@/adventure/data/v2/dungeonDrops";

export type CatalogOption = { id: string; name: string; label: string };

export function v2MaterialOptions(): CatalogOption[] {
  return Object.values(V2_MATERIALS).map((m) => ({
    id: m.id,
    name: m.name,
    label: `${m.name} (${m.id})`,
  }));
}

export function v2EquipmentOptions(): CatalogOption[] {
  return Object.values(V2_EQUIPMENT)
    .slice()
    .sort((a, b) => a.tier - b.tier || a.slot.localeCompare(b.slot))
    .map((e) => ({
      id: e.id,
      name: e.name,
      label: `T${e.tier} · ${e.slot} · ${e.name} (${e.id})`,
    }));
}
