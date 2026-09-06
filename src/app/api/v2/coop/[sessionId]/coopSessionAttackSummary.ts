import type { ProfileBorderId } from "@/adventure/data/v2/museunCosmetics";
import type { Avatar } from "@/adventure/profile/avatars";

type CoopSessionAttackRow = {
  id: number;
  userId: string;
  name: string;
  damageDealt: number;
  damageTaken: number;
  diedEarly: boolean;
  isSupport?: boolean;
  createdAt: Date;
};

export type CoopSessionAttackSummary = {
  id: number;
  name: string;
  damageDealt: number;
  damageTaken: number;
  diedEarly: boolean;
  isSupport?: boolean;
  isMe: boolean;
  avatar: Avatar;
  profileBorder: ProfileBorderId | null;
  at: number;
};

export function toCoopSessionAttackSummary({
  attack,
  viewerUserId,
  avatar,
  profileBorder,
}: {
  attack: CoopSessionAttackRow;
  viewerUserId: string;
  avatar: Avatar;
  profileBorder: ProfileBorderId | null;
}): CoopSessionAttackSummary {
  return {
    id: attack.id,
    name: attack.name,
    damageDealt: attack.damageDealt,
    damageTaken: attack.damageTaken,
    diedEarly: attack.diedEarly,
    isSupport: attack.isSupport === true,
    isMe: attack.userId === viewerUserId,
    avatar,
    profileBorder,
    at: attack.createdAt.getTime(),
  };
}
