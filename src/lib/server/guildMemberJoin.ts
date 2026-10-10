import type { db } from "@/db";
import { guildMembers } from "@/db/schema";
import { rewardReferralTutorialTasks } from "./referrals";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// 가입 신청 승인과 초대 수락이 함께 쓰는 길드원 추가. 시설 주간 기록은 계정 단위라 옮길 것이 없다.
export async function addGuildMember(
  tx: Tx,
  userId: string,
  guildId: number,
): Promise<void> {
  await tx.insert(guildMembers).values({
    guildId,
    userId,
    role: "member",
  });
  await rewardReferralTutorialTasks(
    tx,
    userId,
    "새 모험가",
    ["join_guild"],
  );
}
