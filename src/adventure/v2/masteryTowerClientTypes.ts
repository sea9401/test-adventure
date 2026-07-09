export type TowerState = {
  date: string;
  todayBestFloor: number;
  runFloor: number;
  claimed: boolean;
  lifetimeBestFloor: number;
  firstClearRewardsClaimed: number[];
  cooldownUntil?: number;
};

export type TowerJob = {
  id: string;
  name: string;
  tier: number;
  group: string;
  mastery: number;
};

export type TowerBoss = {
  floor: number;
  name: string;
  description: string;
  powerBonusPercent: number;
  gimmick?: {
    name: string;
    description: string;
  };
};

export type TowerGimmickCheck = {
  id: string;
  label: string;
  value: number;
  target: number;
  passed: boolean;
};

export type TowerGimmick = {
  name: string;
  description: string;
  checks: TowerGimmickCheck[];
  penaltyPercent: number;
  hint: string;
};

export type TowerFloorInfo = {
  floor: number;
  reward: number;
  baseRequiredPower: number;
  requiredPower: number;
  boss: TowerBoss | null;
  gimmick: TowerGimmick | null;
};

export type TowerClaimPreview = {
  base: number;
  firstClearBonus: number;
  total: number;
  newlyClaimedMilestones: number[];
};

export type TowerStatus = {
  ok?: boolean;
  error?: string;
  tower: TowerState;
  certificates: number;
  claimPreview: TowerClaimPreview;
  retryAfterSeconds?: number;
  power: number;
  nextFloor: number | null;
  nextRequiredPower: number | null;
  nextEncounter: TowerFloorInfo | null;
  rewards: {
    samples: TowerFloorInfo[];
    milestones: { floor: number; bonus: number }[];
    bosses: TowerBoss[];
  };
  jobs: TowerJob[];
};

export type TowerAttemptResult = {
  ok?: boolean;
  success?: boolean;
  error?: string;
  tower?: TowerState;
  power?: number;
  floor?: number | null;
  requiredPower?: number | null;
  encounter?: TowerFloorInfo | null;
  retryAfterSeconds?: number;
  claimPreview?: TowerClaimPreview;
};
