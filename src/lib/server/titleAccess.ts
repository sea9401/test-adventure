import {
  GM_TITLE_ID,
  TITLES,
  type TitleId,
} from "@/adventure/data/titles";
import { ownedTitleIdsOf } from "@/lib/server/grantTitle";

/** 계정 권한까지 반영해 해당 칭호를 사용할 수 있는지 판정한다. */
export function titleIsAvailableToAccount(
  titleId: TitleId,
  isAdminAccount: boolean,
): boolean {
  const title = TITLES[titleId];
  return Boolean(title && (!title.adminOnly || isAdminAccount));
}

/** 저장된 보유분에 계정 전용 가상 칭호를 합치고 권한 없는 전용 칭호는 제거한다. */
export function accountOwnedTitleIds(
  adventureLogRaw: unknown,
  isAdminAccount: boolean,
): string[] {
  const owned = ownedTitleIdsOf(adventureLogRaw).filter(
    (titleId) => !TITLES[titleId]?.adminOnly || isAdminAccount,
  );
  if (isAdminAccount && !owned.includes(GM_TITLE_ID)) owned.push(GM_TITLE_ID);
  return owned;
}

export function accountOwnsTitle(
  adventureLogRaw: unknown,
  titleId: TitleId,
  isAdminAccount: boolean,
): boolean {
  return (
    titleIsAvailableToAccount(titleId, isAdminAccount) &&
    accountOwnedTitleIds(adventureLogRaw, isAdminAccount).includes(titleId)
  );
}
