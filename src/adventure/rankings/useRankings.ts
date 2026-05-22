"use client";

import { useAsyncData } from "@/lib/useAsyncData";

// 개인 metric 5종(레벨/명성/전투/이번주 고탑/도전 최고층) + 길드 누적 명성 1종.
export type RankingMetric =
  | "level"
  | "fame"
  | "battleCount"
  | "towerWeek"
  | "towerChallenge"
  | "guild";

export type RankingEntry = {
  rank: number;
  name: string;
  level: number;
  /** 파라곤 레벨(획득 총 포인트 0~150). 만렙 미만은 0. level 탭에서 "Lv. 100 +N" 표시. */
  paragonLevel: number;
  fame: number;
  battleCount: number;
  weekHighest: number;
  /** 도전 모드 영구 최고층 (tower-challenge.v1.progress.highestFloor). */
  challengeHighest: number;
  mine: boolean;
};

export type RankingMe = {
  rank: number;
  name: string;
  level: number;
  paragonLevel: number;
  fame: number;
  battleCount: number;
  weekHighest: number;
  challengeHighest: number;
};

export type GuildRankingEntry = {
  rank: number;
  name: string;
  fameTotal: number;
  memberCount: number;
  grade: string;
  mine: boolean;
};

export type GuildRankingMe = {
  rank: number;
  name: string;
  fameTotal: number;
  memberCount: number;
  grade: string;
};

type RankingsResponse = {
  list: RankingEntry[];
  me: RankingMe | null;
};

type GuildRankingsResponse = {
  list: GuildRankingEntry[];
  me: GuildRankingMe | null;
};

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as T;
}

// 랭킹 데이터 fetch — 서버가 닉네임 보유 유저 전체에서 derive 해 정렬한 결과를 받는다.
// 본인 등록 액션은 없음 (자동 포함). metric === "guild" 는 useGuildRankings 가 담당.
export function useRankings(metric: RankingMetric) {
  const { data, loading, error } = useAsyncData<RankingsResponse>(
    (signal) => getJson(`/api/rankings?metric=${metric}`, signal),
    [metric],
    { enabled: metric !== "guild", errorMessage: "랭킹을 불러오지 못했습니다." },
  );
  return { list: data?.list ?? null, me: data?.me ?? null, loading, error };
}

export function useGuildRankings(active: boolean) {
  const { data, loading, error } = useAsyncData<GuildRankingsResponse>(
    (signal) => getJson("/api/rankings/guilds", signal),
    [],
    { enabled: active, errorMessage: "길드 랭킹을 불러오지 못했습니다." },
  );
  return { list: data?.list ?? null, me: data?.me ?? null, loading, error };
}
