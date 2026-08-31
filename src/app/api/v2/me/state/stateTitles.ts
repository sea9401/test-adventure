import { ARENA_CHAMPION_TITLE_ID } from "@/adventure/data/titles";
import { hasArenaChampionshipWin } from "@/adventure/data/v2/arenaChampionshipBadges";
import { isAdminEmail } from "@/lib/server/adminEmailAccess";
import { grantTitleIfMissing } from "@/lib/server/grantTitle";
import {
  INSOMNIA_TITLE_ID,
  isInsomniaTitleWindow,
} from "@/lib/server/insomniaTitle";
import { stateHiddenTitleIds } from "@/lib/server/stateHiddenTitles";
import { accountOwnedTitleIds } from "@/lib/server/titleAccess";

export async function reconcileOwnedTitleIds(input: {
  userId: string;
  adventureLogRaw: unknown;
  email: string | null | undefined;
  gold: number | undefined;
  arenaChampionshipBadges: unknown;
}): Promise<string[]> {
  let ownedTitleIds = accountOwnedTitleIds(
    input.adventureLogRaw,
    isAdminEmail(input.email),
  );
  if (
    !ownedTitleIds.includes(INSOMNIA_TITLE_ID) &&
    isInsomniaTitleWindow(new Date())
  ) {
    const granted = await grantTitleIfMissing(
      input.userId,
      INSOMNIA_TITLE_ID,
      Date.now(),
    );
    if (granted) ownedTitleIds = [...ownedTitleIds, INSOMNIA_TITLE_ID];
  }
  for (const titleId of stateHiddenTitleIds({ gold: input.gold })) {
    if (ownedTitleIds.includes(titleId)) continue;
    const granted = await grantTitleIfMissing(
      input.userId,
      titleId,
      Date.now(),
    );
    if (granted) ownedTitleIds = [...ownedTitleIds, titleId];
  }
  if (
    !ownedTitleIds.includes(ARENA_CHAMPION_TITLE_ID) &&
    hasArenaChampionshipWin(input.arenaChampionshipBadges)
  ) {
    await grantTitleIfMissing(
      input.userId,
      ARENA_CHAMPION_TITLE_ID,
      Date.now(),
    );
    ownedTitleIds = [...ownedTitleIds, ARENA_CHAMPION_TITLE_ID];
  }
  return ownedTitleIds;
}
