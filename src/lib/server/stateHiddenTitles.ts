import { BEGGAR_TITLE_ID } from "@/adventure/data/titles";

type StateHiddenTitleInput = {
  gold: unknown;
};

/**
 * 상태 조회만으로 확정할 수 있는 히든 칭호를 돌려준다.
 * 이벤트 순간에만 알 수 있는 전투·낚시·강화 칭호는 각 권위 라우트에서 판정한다.
 */
export function stateHiddenTitleIds({
  gold,
}: StateHiddenTitleInput): string[] {
  return typeof gold === "number" && Number.isFinite(gold) && gold === 0
    ? [BEGGAR_TITLE_ID]
    : [];
}
