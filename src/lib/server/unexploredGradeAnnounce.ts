import {
  explorationGrade,
  explorationGradeBonusPoints,
  explorationGradeTitleIds,
} from "@/adventure/data/v2/unexploredGrade";
import type { ExplorationXpGrant } from "@/adventure/data/v2/unexploredProgression";
import type { DbExecutor } from "@/lib/server/savesKv";
import { insertNotificationWith } from "@/lib/server/v2Notifications";

/**
 * 사냥으로 탐사 등급이 올랐으면 같은 트랜잭션에서 알리고, 지금 등급으로 받을 수 있는 칭호 id 를
 * 돌려준다. 칭호는 호출한 쪽이 사냥 기록(adventure-log.v2)을 쓸 때 함께 적는다. 등급이 오르지
 * 않았으면 아무것도 하지 않고 빈 배열을 돌려준다.
 */
export async function announceExplorationGrade(
  tx: DbExecutor,
  userId: string,
  grant: Pick<ExplorationXpGrant, "save" | "gradesGained"> | null,
): Promise<string[]> {
  if (!grant || grant.gradesGained <= 0) return [];
  const grade = explorationGrade(grant.save);
  await insertNotificationWith(tx, userId, "exploration_grade", {
    grade,
    pointsGained:
      explorationGradeBonusPoints(grade) -
      explorationGradeBonusPoints(grade - grant.gradesGained),
  });
  return explorationGradeTitleIds(grade);
}
