export const PLAYER_SANCTION_POLL_MS = 120_000;

export type PlayerSanctionWarning = {
  id: number;
  reason: string;
  createdAt: string;
};

export type PlayerSuspension = {
  reason: string;
  expiresAt: string;
  permanent: boolean;
};

export type PlayerTradeSuspension = PlayerSuspension & {
  id: number;
  acknowledged: boolean;
};

export type PlayerSanctionStatus = {
  suspension: PlayerSuspension | null;
  tradeSuspension: PlayerTradeSuspension | null;
  warning: PlayerSanctionWarning | null;
};
